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
  async history(
    _space: string,
    kind: string,
    id: string,
    before = 0,
    limit = 50,
  ) {
    return structuredClone(
      this.log
        .flatMap((b) => b.records)
        .filter(
          (r) =>
            r.kind === kind &&
            r.id === id &&
            r.version < (before || Infinity) &&
            r.version < this.records.get(syncKey(r))!.version,
        )
        .sort((a, b) => b.version - a.version)
        .slice(0, limit),
    );
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
      engine.observe(doc);
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
  it("joins existing desktop and phone libraries and uploads the local-only manuscripts", async () => {
    const cloud = new Remote(),
      a = await device(cloud, "phone"),
      b = await device(cloud, "desktop");
    const author = (d: CanvasDocument, id: string) => {
      d.notes = [
        { id: "note." + id, title: "相同标题", blocks: ["text." + id] },
      ];
      d.blocks = [{ id: "text." + id, type: "markdown", source: id }];
      d.board.placements = [
        { id: "place." + id, content: "note." + id, x: 0, y: 0, width: 220 },
      ];
    };
    author(a.doc, "cloud");
    a.doc.title = "文稿";
    a.doc.board.id = "board.home";
    author(b.doc, "local");
    await a.init("upload");
    await a.engine.run();
    await b.init("download");
    expect(b.engine.status.conflict).toBeUndefined();
    expect(b.doc.notes.map((n) => n.id)).toEqual(["note.cloud", "note.local"]);
    expect(b.doc.board.placements).toHaveLength(2);
    b.edit("text.local", "offline");
    await b.reopen();
    await b.init("download");
    await b.engine.run();
    await a.engine.run(false);
    expect(a.text("text.local")).toBe("offline");
    expect(a.text("text.cloud")).toBe("cloud");
  });

  it("retains divergent blocks on first join until reviewed across restart", async () => {
    const remote = new Remote(),
      a = await device(remote, "a"),
      b = await device(remote, "b");
    const [id] = textIDs(a.doc);
    a.edit(id, "cloud");
    b.edit(id, "local");
    await a.init("upload");
    await a.engine.run();
    await b.init("download");
    await b.reopen();
    await b.engine.run();
    expect(b.text(id)).toBe("local");
    expect(remote.records.get("block:" + id)?.data?.source).toBe("cloud");
    expect(b.engine.status.conflict?.conflicts.map((c) => c.key)).toEqual([
      "block:" + id,
    ]);
    await b.engine.resolve(
      { ["block:" + id]: "local" },
      undefined,
      b.engine.status.conflict?.reviewId,
    );
    await b.engine.run();
    expect(remote.records.get("block:" + id)?.data?.source).toBe("local");
  });

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
    remote.records.get("block:" + first)!.updatedAt =
      "2026-01-01T00:00:00.123456Z"; // Snapshot timestamp precision is not a semantic edit.
    await b.engine.resolve(
      { ["block:" + first]: "local" },
      undefined,
      b.engine.status.conflict?.reviewId,
    );
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
    await a.init("download");
    expect(a.engine.status.pending).toBe(true);
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
      b.engine.resolve(
        { ["block:" + first]: "local" },
        undefined,
        b.engine.status.conflict?.reviewId,
      ),
    ).rejects.toThrow("已变化");
    expect(b.engine.status.conflict?.conflicts[0].remote?.data?.source).toBe(
      "remote moved",
    );
  });
  it("restores an old block as a new durable edit and rejects stale review", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await a.init("upload");
    await a.engine.run();
    const [id] = textIDs(a.doc);
    a.edit(id, "version two");
    await a.engine.run();
    const old = (await remote.history("space.test", "block", id))[0];
    await expect(a.engine.restoreBlock(old, 1)).rejects.toThrow("已变化");
    await a.engine.restoreBlock(old, 2);
    await a.engine.run();
    expect(remote.records.get("block:" + id)?.version).toBe(3);
    expect(a.text(id)).toBe(old.data!.source);
  });
  it("restores a deleted attachment block with its retained asset identity and original", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    const bytes = Buffer.from("synthetic original");
    const asset = {
      id: "asset.restore",
      name: "restore.pdf",
      mime: "application/pdf",
      bytes: bytes.length,
      sha256: "a".repeat(64),
    };
    a.doc.assets.push(asset);
    a.doc.blocks.push({ id: "file.restore", type: "file", asset: asset.id });
    const note = a.doc.notes[0];
    note.blocks.push("file.restore");
    a.io.asset = async () => bytes;
    await a.init("upload");
    await a.engine.run();
    a.doc.blocks = a.doc.blocks.filter((b) => b.id !== "file.restore");
    note.blocks = note.blocks.filter((id) => id !== "file.restore");
    a.doc.assets = [];
    a.doc.revision++;
    a.engine.observe(a.doc);
    await a.engine.run();
    expect(remote.records.get("block:file.restore")?.deleted).toBe(true);
    a.io.asset = async () => undefined;
    let downloads = 0;
    remote.download = async () => {
      downloads++;
      return bytes;
    };
    const version = (
      await remote.history("space.test", "block", "file.restore")
    )[0];
    await a.engine.restoreBlock(version, 2, note.id);
    expect(a.doc.notes[0].blocks).toContain("file.restore");
    expect(a.doc.assets).toContainEqual(asset);
    expect(downloads).toBe(1);
    a.io.asset = async () => bytes;
    await a.engine.run();
    expect(remote.records.get("block:file.restore")?.version).toBe(3);
    expect(remote.records.get("asset:asset.restore")?.deleted).toBe(false);
  });
  it("lets separate save groups sync while a conflicting atomic group waits", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await a.init("upload");
    await a.engine.run();
    const b = await device(remote, "b");
    await b.init("download");
    const [first, second] = textIDs(a.doc);
    a.edit(first, "cloud conflict");
    await a.engine.run();
    b.edit(first, "local conflict");
    await b.engine.run();
    const reviewed = b.engine.status.conflict!.reviewId;
    b.edit(second, "independent change");
    await b.engine.run();
    expect(remote.records.get("block:" + second)?.data?.source).toBe(
      "independent change",
    );
    expect(remote.records.get("block:" + first)?.data?.source).toBe(
      "cloud conflict",
    );
    expect(b.engine.status.conflict).toBeTruthy();
    await expect(
      b.engine.resolve({ ["block:" + first]: "local" }, undefined, reviewed),
    ).rejects.toThrow("已变化");
    await b.reopen();
    expect(b.engine.status.conflict).toBeTruthy();
    await b.engine.resolve(
      { ["block:" + first]: "local" },
      undefined,
      b.engine.status.conflict!.reviewId,
    );
    await b.engine.run();
    expect(remote.records.get("block:" + first)?.data?.source).toBe(
      "local conflict",
    );
  });
  it("does not split one atomic save just because only one of its blocks conflicts", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await a.init("upload");
    await a.engine.run();
    const b = await device(remote, "b");
    await b.init("download");
    const [first, second] = textIDs(a.doc);
    const old = remote.records.get("block:" + second)?.data?.source;
    a.edit(first, "cloud");
    await a.engine.run();
    for (const id of [first, second])
      (
        b.doc.blocks.find((block) => block.id === id) as { source: string }
      ).source = "atomic local";
    b.doc.revision++;
    b.engine.observe(b.doc);
    await b.engine.flushObservations();
    await b.reopen();
    await b.engine.run();
    expect(b.engine.status.conflict).toBeTruthy();
    expect(remote.records.get("block:" + second)?.data?.source).toBe(old);
    expect(await b.engine.hasChanges()).toBe(false);
  });
  it("waits for the local save journal before a manual upload", async () => {
    const remote = new Remote(),
      a = await device(remote, "a");
    await a.init("upload");
    await a.engine.run();
    const [id] = textIDs(a.doc);
    a.edit(id, "immediate sync");
    await Promise.all([a.engine.flushObservations(), a.engine.run()]);
    expect(remote.records.get("block:" + id)?.data?.source).toBe(
      "immediate sync",
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
