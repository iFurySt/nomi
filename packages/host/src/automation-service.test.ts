import { afterEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AutomationService,
  type AutomationSession,
} from "./automation-service";
import { DocumentStore } from "./document-store";
import {
  createCanvasDocument,
  parseCanvasDocument,
} from "../../core/src/canvas/index";
import { startAutomationServer } from "./automation-server";
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nomi-mcp-test-"));
  temporary.push(root);
  const store = new DocumentStore(
    join(root, "settings.json"),
    join(root, "library"),
  );
  let doc = parseCanvasDocument({
    ...createCanvasDocument(),
    notes: [{ id: "note", title: "Test", blocks: ["text"] }],
    blocks: [{ id: "text", type: "markdown", source: "hello world" }],
    assets: [],
    board: { id: "board", placements: [] },
  });
  await store.save({
    profile: "local-device",
    documentId: doc.id,
    document: doc,
    baseRevision: null,
    assets: [],
  });
  let commits = 0;
  const session: AutomationSession = {
    async snapshot() {
      return {
        document: structuredClone(doc),
        context: { activeNote: { id: "note", title: "Test" } },
      };
    },
    async commit(next, revision, assets) {
      if (doc.revision !== revision) throw Error("REVISION_CONFLICT");
      await store.save({
        profile: "local-device",
        documentId: doc.id,
        document: next,
        baseRevision: revision,
        assets,
      });
      doc = next;
      commits++;
    },
    async asset(id) {
      const a = await store.asset("local-device", doc.id, id);
      if (!a) throw Error("missing");
      return a.bytes;
    },
    async open(noteId, blockId) {
      return { noteId, blockId };
    },
  };
  const options = {
    session,
    journalDirectory: join(root, "journal"),
    libraryPath: async () => (await store.status()).path,
  };
  const service = new AutomationService(options),
    context = (await service.call("get_context", {})) as any;
  return {
    root,
    store,
    session,
    options,
    service,
    context,
    get doc() {
      return doc;
    },
    get commits() {
      return commits;
    },
  };
}
describe("local automation service", () => {
  it("durably deduplicates retries, rejects stale writes and survives process recreation", async () => {
    const f = await fixture();
    const p = {
      workspaceId: f.context.workspaceId,
      expectedRevision: f.doc.revision,
      requestId: "rename",
      noteId: "note",
      title: "Renamed",
    };
    const first = await f.service.call("update_note", p);
    expect(
      await new AutomationService(f.options).call("update_note", p),
    ).toEqual(first);
    expect(f.commits).toBe(1);
    await expect(
      f.service.call("update_note", { ...p, title: "Different" }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(
      f.service.call("update_note", { ...p, requestId: "stale" }),
    ).rejects.toThrow("REVISION_CONFLICT");
    expect((await f.store.load("local-device", f.doc.id))?.notes[0].title).toBe(
      "Renamed",
    );
  });
  it("deduplicates equivalent request JSON with different object-key order", async () => {
    const f = await fixture();
    const args = {
      workspaceId: f.context.workspaceId,
      expectedRevision: 1,
      requestId: "key-order",
      blockId: "text",
      block: { type: "markdown", source: "changed" },
    };
    const result = await f.service.call("update_block", args);
    expect(
      await f.service.call("update_block", {
        ...args,
        block: { source: "changed", type: "markdown" },
      }),
    ).toEqual(result);
    expect(f.commits).toBe(1);
  });
  it("restores persisted trash and agent edits while keeping unrelated changes", async () => {
    const f = await fixture(),
      scope = { workspaceId: f.context.workspaceId };
    const removed = (await f.service.call("trash_note", {
      ...scope,
      expectedRevision: 1,
      requestId: "trash",
      noteId: "note",
      includeChildren: false,
    })) as any;
    const again = new AutomationService(f.options);
    expect(await again.call("list_trash", scope)).toMatchObject({ total: 1 });
    await again.call("create_note", {
      ...scope,
      expectedRevision: f.doc.revision,
      requestId: "new",
      title: "Keep me",
    });
    await again.call("restore_note", {
      ...scope,
      expectedRevision: f.doc.revision,
      requestId: "restore",
      changeId: removed.changeId,
    });
    expect(f.doc.notes.map((n) => n.title)).toContain("Keep me");
    expect(f.doc.notes.map((n) => n.title)).toContain("Test");
    expect(await again.call("list_trash", scope)).toMatchObject({ total: 0 });
  });
  it("rolls back invalid batches and records only successful effects", async () => {
    const f = await fixture();
    await expect(
      f.service.call("apply_changes", {
        workspaceId: f.context.workspaceId,
        expectedRevision: 1,
        requestId: "batch",
        operations: [
          { type: "update_note", noteId: "note", title: "No" },
          { type: "remove_blocks", noteId: "note", blockIds: ["missing"] },
        ],
      }),
    ).rejects.toThrow();
    expect(f.commits).toBe(0);
    expect(f.doc.notes[0].title).toBe("Test");
  });
  it("imports attachment bytes, exports portable package and imports an independent copy", async () => {
    const f = await fixture(),
      scope = { workspaceId: f.context.workspaceId };
    const path = join(f.root, "sample.txt");
    await writeFile(path, "attachment content");
    const result = (await f.service.call("import_asset", {
      ...scope,
      expectedRevision: 1,
      requestId: "asset",
      noteId: "note",
      path,
    })) as any;
    expect(
      await f.service.call("read_asset", {
        ...scope,
        assetId: result.assetId,
        length: 5,
      }),
    ).toMatchObject({
      base64: Buffer.from("attac").toString("base64"),
      nextOffset: 5,
    });
    const out = join(f.root, "export");
    await f.service.call("export_note", {
      ...scope,
      noteId: "note",
      path: out,
      format: "markdown",
    });
    expect(await readdir(out)).toContain("Test.nomi");
    await expect(
      f.service.call("export_note", {
        ...scope,
        noteId: "note",
        path: out,
        format: "nomi",
      }),
    ).rejects.toThrow();
    const imported = (await f.service.call("import_note", {
      ...scope,
      expectedRevision: f.doc.revision,
      requestId: "import",
      path: join(out, "Test.nomi"),
      format: "nomi",
    })) as any;
    expect(imported.noteIds[0]).not.toBe("note");
    expect(f.doc.notes.length).toBe(2);
    expect(f.doc.assets.length).toBe(2);
    expect(
      Buffer.from(await f.session.asset(f.doc.assets[1].id)).toString(),
    ).toBe("attachment content");
  });
  it("rejects active-library exports, directory attachments and malformed image input", async () => {
    const f = await fixture(),
      scope = { workspaceId: f.context.workspaceId };
    await expect(
      f.service.call("export_note", {
        ...scope,
        noteId: "note",
        path: join(f.root, "library", "bad"),
        format: "nomi",
      }),
    ).rejects.toThrow("INVALID_DESTINATION");
    await expect(
      f.service.call("import_asset", {
        ...scope,
        expectedRevision: 1,
        requestId: "dir",
        noteId: "note",
        path: f.root,
      }),
    ).rejects.toThrow();
    const path = join(f.root, "fake.png");
    await writeFile(path, "bad");
    await expect(
      f.service.call("import_asset", {
        ...scope,
        expectedRevision: 1,
        requestId: "image",
        noteId: "note",
        path,
        display: "image",
      }),
    ).rejects.toThrow("INVALID_IMAGE");
  });
  it("recovers a saved receipt after a transport error without applying it twice", async () => {
    const f = await fixture();
    const commit = f.session.commit;
    f.session.commit = async (...args) => {
      await commit(...args);
      throw Error("Connection closed");
    };
    const p = {
      workspaceId: f.context.workspaceId,
      expectedRevision: 1,
      requestId: "lost",
      noteId: "note",
      title: "Saved",
    };
    await expect(f.service.call("update_note", p)).rejects.toThrow(
      "Connection closed",
    );
    const result = await new AutomationService(f.options).call(
      "update_note",
      p,
    );
    expect(result).toMatchObject({ revision: 2 });
    expect(f.commits).toBe(1);
  });
  it("rejects a local edit arriving between snapshot and commit without overwriting it", async () => {
    const f = await fixture();
    const commit = f.session.commit;
    f.session.commit = async (next, revision, assets) => {
      const local = structuredClone(f.doc);
      local.revision += 1;
      local.notes[0].title = "User typing";
      await commit(local, revision, []);
      await commit(next, revision, assets);
    };
    await expect(
      f.service.call("update_note", {
        workspaceId: f.context.workspaceId,
        expectedRevision: 1,
        requestId: "race",
        noteId: "note",
        title: "Agent edit",
      }),
    ).rejects.toThrow("REVISION_CONFLICT");
    expect(f.doc.notes[0].title).toBe("User typing");
    expect(f.commits).toBe(1);
  });
  it("exposes persistent diffs and refuses to revert a subsequently edited object", async () => {
    const f = await fixture(),
      scope = { workspaceId: f.context.workspaceId };
    const first = (await f.service.call("edit_text", {
      ...scope,
      expectedRevision: 1,
      requestId: "first",
      blockId: "text",
      oldText: "world",
      newText: "Nomi",
    })) as any;
    const change = (await f.service.call("get_change", {
      ...scope,
      changeId: first.changeId,
    })) as any;
    expect(change.change.changes[0]).toMatchObject({
      id: "text",
      before: { source: "hello world" },
      after: { source: "hello Nomi" },
    });
    await f.service.call("edit_text", {
      ...scope,
      expectedRevision: 2,
      requestId: "second",
      blockId: "text",
      oldText: "Nomi",
      newText: "later",
    });
    await expect(
      f.service.call("revert_change", {
        ...scope,
        expectedRevision: 3,
        requestId: "reverse",
        changeId: first.changeId,
      }),
    ).rejects.toThrow("RESTORE_CONFLICT");
    expect(await f.service.call("list_changes", scope)).toMatchObject({
      total: 2,
    });
    await expect(
      f.service.call("get_note", {
        workspaceId: "another-library",
        noteId: "note",
      }),
    ).rejects.toThrow("WORKSPACE_MISMATCH");
  });
  it("requires a token, rejects browser Origins, and creates a private connection file", async () => {
    const root = await mkdtemp(join(tmpdir(), "nomi-bridge-test-"));
    temporary.push(root);
    await mkdir(join(root, "mcp"));
    const file = join(root, "mcp", "connection.json"),
      server = await startAutomationServer(file, async () => ({ ok: true }));
    try {
      const { readFile } = await import("node:fs/promises"),
        descriptor = JSON.parse(await readFile(file, "utf8"));
      const url = `http://127.0.0.1:${server.port}/call`;
      expect((await stat(file)).mode & 0o077).toBe(0);
      expect(
        (
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"name":"get_context"}',
          })
        ).status,
      ).toBe(403);
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${descriptor.token}`,
      };
      expect(
        (
          await fetch(url, {
            method: "POST",
            headers: { ...headers, Origin: "https://evil.example" },
            body: '{"name":"get_context"}',
          })
        ).status,
      ).toBe(403);
      expect(
        await (
          await fetch(url, {
            method: "POST",
            headers,
            body: '{"name":"get_context"}',
          })
        ).json(),
      ).toMatchObject({ ok: true, value: { ok: true } });
    } finally {
      await server.close();
    }
  });
});
