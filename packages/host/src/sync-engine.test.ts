import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  SyncEngine,
  type SyncLocalIO,
  type SyncTransport,
} from "./sync-engine";
import { SyncAPIError } from "./sync-client";
import {
  createCanvasDocument,
  type CanvasDocument,
} from "../../core/src/canvas/document";
import {
  SYNC_PROTOCOL,
  stableJSON,
  syncKey,
  type SyncCommit,
  type SyncRecord,
  type SyncReceipt,
} from "../../core/src/sync/protocol";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
class Remote implements SyncTransport {
  records = new Map<string, SyncRecord>();
  sequence = 0;
  log: { sequence: number; records: SyncRecord[] }[] = [];
  receipts = new Map<string, { body: string; receipt: SyncReceipt }>();
  failAfterCommit = false;
  reset = false;
  beforeCommit?: () => Promise<void>;
  async snapshot() {
    return structuredClone({
      protocol: SYNC_PROTOCOL,
      cursor: this.sequence,
      records: [...this.records.values()],
    });
  }
  async changes(_space: string, after: number) {
    if (this.reset) throw new SyncAPIError(410, "reset_required", "reset");
    return structuredClone({
      protocol: SYNC_PROTOCOL,
      cursor: this.sequence,
      hasMore: false,
      changes: this.log.filter((b) => b.sequence > after),
    });
  }
  async commit(_space: string, commit: SyncCommit) {
    const cached = this.receipts.get(commit.requestId);
    if (cached) {
      if (cached.body !== stableJSON(commit)) throw Error("changed retry");
      return structuredClone(cached.receipt);
    }
    const hook = this.beforeCommit;
    this.beforeCommit = undefined;
    await hook?.();
    for (const m of commit.mutations)
      if ((this.records.get(syncKey(m))?.version ?? 0) !== m.baseVersion)
        throw new SyncAPIError(409, "conflict", "conflict");
    const records = commit.mutations.map((m) => ({
      kind: m.kind,
      id: m.id,
      version: m.baseVersion + 1,
      deleted: m.deleted,
      data: structuredClone(m.data),
      updatedAt: new Date(this.sequence * 1000).toISOString(),
    }));
    records.forEach((r) => this.records.set(syncKey(r), r));
    this.log.push({ sequence: ++this.sequence, records });
    const receipt = {
      sequence: this.sequence,
      versions: records.map((r) => ({
        kind: r.kind,
        id: r.id,
        version: r.version,
      })),
    };
    this.receipts.set(commit.requestId, { body: stableJSON(commit), receipt });
    if (this.failAfterCommit) {
      this.failAfterCommit = false;
      throw Error("connection lost after server commit");
    }
    return structuredClone(receipt);
  }
  async upload() {}
  async download(): Promise<Buffer> {
    throw Error("unexpected asset");
  }
}
async function device(remote: Remote, _name: string) {
  const folder = await mkdtemp(join(tmpdir(), "nomi-sync-engine-"));
  roots.push(folder);
  let doc = createCanvasDocument();
  const io: SyncLocalIO = {
    async read() {
      return structuredClone(doc);
    },
    async asset() {
      return undefined;
    },
    async apply(before, after) {
      if (before.revision !== doc.revision) throw Error("EDITOR_BUSY");
      doc = structuredClone(after);
    },
  };
  const binding = {
    server: "http://127.0.0.1",
    user: "user.test",
    space: "space.test",
    library: folder,
  };
  let engine = await SyncEngine.open(folder, binding, remote, io);
  return {
    folder,
    io,
    get engine() {
      return engine;
    },
    get doc() {
      return doc;
    },
    edit(id: string, source: string) {
      const b = doc.blocks.find((b) => b.id === id)!;
      if (b.type !== "markdown") throw Error("fixture");
      b.source = source;
      doc.revision++;
    },
    async reopen() {
      engine = await SyncEngine.open(folder, binding, remote, io);
    },
    async init(mode: "upload" | "download") {
      await engine.initialize(mode);
    },
    text(id: string) {
      return (doc.blocks.find((b) => b.id === id) as { source: string }).source;
    },
  };
}
function textIDs(doc: CanvasDocument) {
  return doc.blocks.filter((b) => b.type === "markdown").map((b) => b.id);
}
describe("durable sync engine", () => {
  it("merges separate offline edits and resolves same-block conflicts without losing either version", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await a.init("upload");
    await a.engine.run();
    const b = await device(remote, "b");
    await b.init("download");
    const [first, second] = textIDs(a.doc);
    expect(second).toBeTruthy();
    a.edit(first, "A");
    b.edit(second, "B");
    await a.engine.run();
    await b.engine.run();
    await a.engine.run(false);
    expect(a.text(second)).toBe("B");
    expect(b.text(first)).toBe("A");
    a.edit(first, "A competing");
    b.edit(first, "B competing");
    await a.engine.run();
    await b.engine.run();
    expect(b.engine.status.conflict?.conflicts).toHaveLength(1);
    expect(b.text(first)).toBe("B competing");
    await b.reopen();
    expect(b.engine.status.conflict).toBeTruthy();
    remote.records.get("block:" + first)!.updatedAt = "2026-01-01T00:00:00.123456Z"; // Snapshot timestamp precision is not a semantic edit.
    await b.engine.resolve({ ["block:" + first]: "local" });
    await b.engine.run();
    await a.engine.run(false);
    expect(a.text(first)).toBe("B competing");
    expect(
      remote.log
        .flatMap((b) => b.records)
        .some((r) => r.data?.source === "A competing"),
    ).toBe(true);
  });
  it("replays the same outbox after lost acknowledgement while preserving newer typing", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await a.init("upload");
    await a.engine.run();
    const [id] = textIDs(a.doc);
    a.edit(id, "sent generation");
    remote.beforeCommit = async () => {
      a.edit(id, "newer generation");
    };
    remote.failAfterCommit = true;
    await expect(a.engine.run()).rejects.toThrow("connection lost");
    const queue = JSON.parse(
      await readFile(join(a.folder, "state.json"), "utf8"),
    ).pending;
    expect(queue.mutations[0].data.source).toBe("sent generation");
    await a.reopen();
    await a.engine.run();
    expect(a.text(id)).toBe("newer generation");
    expect(a.engine.status.pending).toBe(false);
    expect(
      remote.log
        .flatMap((b) => b.records)
        .filter((r) => r.data?.source === "sent generation"),
    ).toHaveLength(1);
    expect(remote.records.get("block:" + id)?.data?.source).toBe(
      "newer generation",
    );
  });
  it("does not move the cursor or overwrite input when the editor changes during remote apply", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await a.init("upload");
    await a.engine.run();
    const b = await device(remote, "b");
    await b.init("download");
    const [id] = textIDs(a.doc);
    a.edit(id, "cloud");
    await a.engine.run();
    const cursor = b.engine.status.cursor;
    const apply = b.io.apply;
    b.io.apply = async () => {
      b.edit(id, "typing");
      throw Error("EDITOR_BUSY");
    };
    await expect(b.engine.run(false)).rejects.toThrow("EDITOR_BUSY");
    expect(b.engine.status.cursor).toBe(cursor);
    b.io.apply = apply;
    await b.engine.run(false);
    expect(b.text(id)).toBe("typing");
    expect(b.engine.status.conflict).toBeTruthy();
  });
  it("resets an expired change log using the old baseline and refuses stale conflict choices", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await a.init("upload");
    await a.engine.run();
    const b = await device(remote, "b");
    await b.init("download");
    const [first, second] = textIDs(a.doc);
    a.edit(first, "remote");
    b.edit(second, "offline");
    await a.engine.run();
    remote.reset = true;
    await b.engine.run();
    expect(b.text(first)).toBe("remote");
    expect(b.text(second)).toBe("offline");
    a.edit(first, "remote again");
    b.edit(first, "conflict");
    await a.engine.run();
    await b.engine.run();
    a.edit(first, "remote moved");
    await a.engine.run();
    await expect(
      b.engine.resolve({ ["block:" + first]: "local" }),
    ).rejects.toThrow("已变化");
    expect(b.engine.status.conflict?.conflicts[0].remote?.data?.source).toBe(
      "remote moved",
    );
  });
  it("poll-only has no cloud writes and refuses uninitialized or changed bindings", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await expect(a.engine.run()).rejects.toThrow("请先选择");
    await a.init("upload");
    await a.engine.run(false);
    expect(remote.sequence).toBe(0);
    await expect(
      SyncEngine.open(
        a.folder,
        {
          server: "http://127.0.0.1",
          user: "other",
          space: "space.test",
          library: a.folder,
        },
        remote,
        a.io,
      ),
    ).rejects.toThrow("不匹配");
  });
});
