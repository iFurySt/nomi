import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rename,
  rm,
  cp,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCanvasDocument,
  emptyCanvasScene,
  applyCanvasCommands,
  type CanvasDocument,
} from "../../core/src/canvas/index";
import { DocumentStore } from "./document-store";
import { readPackage, readPackageTree, packageHash } from "./nomi-package";
import { commitTree } from "./note-directory-tree";
import { recoverPackages } from "./package-transaction";
const temps: string[] = [];
afterEach(async () => {
  for (const p of temps.splice(0))
    await rm(p, { recursive: true, force: true });
});
async function fixture(save = true) {
  const path = await mkdtemp(join(tmpdir(), "nomi-package-test-"));
  temps.push(path);
  const root = join(path, "library"),
    config = join(path, "config.json"),
    store = new DocumentStore(config, root);
  const doc = createCanvasDocument();
  doc.notes[0].title = "A";
  doc.notes[1].title = "B";
  doc.notes[1].parentId = doc.notes[0].id;
  const input = {
    profile: "local-device",
    documentId: doc.id,
    document: doc,
    assets: [],
    baseRevision: null,
  };
  await store.status();
  if (save) await store.save(input);
  const tree = join(root, "文稿");
  const load = async () => (await store.load(input.profile, doc.id))!;
  const put = (d: CanvasDocument, baseRevision: number) =>
    store.save({ ...input, document: d, baseRevision });
  return { path, root, tree, store, doc, input, load, put, config };
}
it("round trips embedded native scenes, nested sources and originals through external edits and import", async () => {
  const f = await fixture();
  const scene = emptyCanvasScene("scene.inline");
  const bytes = Buffer.from("nested original");
  const asset = {
    id: "asset.inner",
    name: "inner.png",
    mime: "image/png",
    bytes: bytes.length,
    sha256: packageHash(bytes),
  };
  scene.assets = [asset];
  scene.blocks = [
    { id: "text.inner", type: "markdown", source: "Nested text" },
    { id: "image.inner", type: "image", asset: asset.id },
  ];
  scene.board.placements = [
    { id: "place.inner", content: "text.inner", x: 0, y: 0, width: 300 },
  ];
  const changed = applyCanvasCommands(f.doc, f.doc.revision, [
    {
      type: "add_block",
      noteId: f.doc.notes[0].id,
      asset,
      block: { id: "canvas.inline", type: "canvas", scene },
    },
  ]);
  await f.store.save({
    ...f.input,
    document: changed,
    baseRevision: f.doc.revision,
    assets: [{ asset, bytes }],
  });
  expect(await f.load()).toEqual(changed);
  const source = join(
    f.tree,
    "A.nomi",
    "canvases",
    "canvas.inline",
    "text",
    "text.inner.md",
  );
  expect(await readFile(source, "utf8")).toBe("Nested text");
  await writeFile(source, "External nested text");
  const external = await f.load();
  expect(external.blocks.find((b) => b.id === "canvas.inline")).toMatchObject({
    scene: {
      blocks: [{ source: "External nested text" }, { asset: asset.id }],
    },
  });
  const outside = join(f.path, "Drawing.nomi");
  await cp(join(f.tree, "A.nomi"), outside, { recursive: true });
  const id = await f.store.importPackage(outside),
    imported = await f.load(),
    note = imported.notes.find((n) => n.id === id)!;
  const block = imported.blocks.find(
    (b) => note.blocks.includes(b.id) && b.type === "canvas",
  )!;
  expect(block.id).not.toBe("canvas.inline");
  if (block.type !== "canvas") throw Error("Missing canvas");
  expect(block.scene.blocks[0]).toMatchObject({
    source: "External nested text",
  });
  expect(block.scene.assets[0].id).not.toBe(asset.id);
  expect(block.scene.blocks[1]).toMatchObject({
    asset: block.scene.assets[0].id,
  });
  expect(imported.assets.some((a) => a.id === block.scene.assets[0].id)).toBe(
    true,
  );
  expect(
    (await readPackage(outside)).document.blocks.find(
      (b) => b.id === "canvas.inline",
    ),
  ).toMatchObject({ scene: { assets: [asset] } });
});
it("round trips all existing document semantics and standalone notes with physical children", async () => {
  const f = await fixture();
  expect(await f.load()).toEqual(f.doc);
  expect((await readdir(f.tree)).sort()).toEqual(["A.nomi", "画布.nomi"]);
  const a = await readPackage(join(f.tree, "A.nomi"));
  expect(a.document.notes[0].blocks).toEqual(f.doc.notes[0].blocks);
  expect(await readdir(join(a.path, "children"))).toEqual(["B.nomi"]);
  const copied = join(f.path, "Detached.nomi");
  await cp(a.path, copied, { recursive: true });
  const standalone = await readPackageTree(f.path, copied);
  expect(standalone.document.notes).toHaveLength(2);
  expect(standalone.document.blocks).toEqual(
    f.doc.blocks.filter((b) =>
      f.doc.notes.some((n) => n.blocks.includes(b.id)),
    ),
  );
});
it("reads direct markdown edits without requiring revisions, and rejects stale local saves", async () => {
  const f = await fixture(),
    id = f.doc.notes[0].blocks[0];
  await writeFile(
    join(f.tree, "A.nomi", "text", id + ".md"),
    "# AI changed\n\n$E=mc^2$\n",
  );
  const external = await f.load();
  expect(external.blocks.find((b) => b.id === id)).toMatchObject({
    source: "# AI changed\n\n$E=mc^2$\n",
  });
  expect(external.revision).toBe(f.doc.revision + 1);
  expect((await f.load()).revision).toBe(external.revision);
  await expect(
    f.put({ ...f.doc, revision: f.doc.revision + 1 }, f.doc.revision),
  ).rejects.toThrow("另一处修改");
});
it("writes only changed source files and keeps package and unchanged source inodes", async () => {
  const f = await fixture();
  const a = join(f.tree, "A.nomi"),
    b = join(a, "children", "B.nomi");
  const before = await stat(a),
    child = await stat(b),
    file = join(b, "document.json"),
    previous = await stat(file);
  const edited = applyCanvasCommands(f.doc, f.doc.revision, [
    {
      type: "set_markdown",
      id: f.doc.notes[0].blocks[0],
      source: "Changed only A",
    },
  ]);
  await f.put(edited, f.doc.revision);
  expect((await stat(a)).ino).toBe(before.ino);
  expect((await stat(b)).ino).toBe(child.ino);
  expect((await stat(file)).mtimeMs).toBe(previous.mtimeMs);
  expect(await f.load()).toEqual(edited);
});
it("preserves unknown files, actual parent relations, and inodes through app move and undo", async () => {
  const f = await fixture(),
    path = join(f.tree, "A.nomi", "children", "B.nomi");
  await writeFile(join(path, "keep.txt"), "ordinary file");
  const before = await stat(path);
  const moved = applyCanvasCommands(f.doc, f.doc.revision, [
    { type: "move_note", id: f.doc.notes[1].id, parentId: null },
  ]);
  moved.notes[0].title = "Renamed";
  await f.put(moved, f.doc.revision);
  expect((await stat(join(f.tree, "B.nomi"))).ino).toBe(before.ino);
  expect(await readFile(join(f.tree, "B.nomi", "keep.txt"), "utf8")).toBe(
    "ordinary file",
  );
  expect(await f.load()).toEqual(moved);
  await f.put({ ...f.doc, revision: moved.revision + 1 }, moved.revision);
  expect((await stat(path)).ino).toBe(before.ino);
});
it("reads Finder rename, child moves and removal without deleting retained content", async () => {
  const f = await fixture();
  await rename(
    join(f.tree, "A.nomi", "children", "B.nomi"),
    join(f.tree, "B moved.nomi"),
  );
  await rename(join(f.tree, "A.nomi"), join(f.tree, "A renamed.nomi"));
  const d = await f.load();
  expect(d.notes.map((n) => n.title)).toEqual(["A renamed", "B moved"]);
  expect(d.notes[1].parentId).toBeUndefined();
  await rm(join(f.tree, "A renamed.nomi"), { recursive: true });
  const next = await f.load();
  expect(next.notes.map((n) => n.title)).toEqual(["B moved"]);
  expect(next.blocks).toEqual(f.doc.blocks);
  expect(
    next.board.placements.some((p) => p.content === f.doc.notes[0].id),
  ).toBe(false);
});
it("new valid packages are discovered and importing creates independent identities and content", async () => {
  const f = await fixture();
  const outside = join(f.path, "External.nomi");
  await cp(join(f.tree, "A.nomi"), outside, { recursive: true });
  const id = await f.store.importPackage(outside);
  const d = await f.load();
  expect(d.notes).toHaveLength(4);
  expect(id).not.toBe(f.doc.notes[0].id);
  expect(d.notes.find((n) => n.id === id)?.title).toBe("External");
  expect((await readPackage(outside)).manifest.packageId).toBe(
    f.doc.notes[0].id,
  );
  expect(new Set(d.blocks.map((b) => b.id)).size).toBe(d.blocks.length);
});
it("self-contained assets survive import into a new library without the original library", async () => {
  const f = await fixture(false),
    bytes = Buffer.from("portable attachment"),
    asset = {
      id: "asset.test",
      name: "sample.pdf",
      mime: "application/pdf",
      sha256: packageHash(bytes),
      bytes: bytes.length,
    };
  f.doc.assets.push(asset);
  f.doc.blocks.push({ id: "b_file", type: "file", asset: asset.id });
  f.doc.notes[0].blocks.push("b_file");
  await f.store.save({ ...f.input, assets: [{ asset, bytes }] });
  const copied = join(f.path, "Detached.nomi");
  await cp(join(f.tree, "A.nomi"), copied, { recursive: true });
  await rm(f.root, { recursive: true });
  const target = new DocumentStore(
    join(f.path, "target.json"),
    join(f.path, "target"),
  );
  await target.importPackage(copied);
  const loaded = (await target.load("local-device", "document.home"))!;
  const imported = loaded.assets.find((a) => a.sha256 === asset.sha256)!;
  expect(
    (await target.asset("local-device", "document.home", imported.id))?.bytes,
  ).toEqual(new Uint8Array(bytes));
});
it("shared block has one owner, live references and a usable detached fallback", async () => {
  const f = await fixture(false);
  const id = f.doc.notes[0].blocks[0];
  f.doc.notes[1].blocks.push(id);
  await f.store.save(f.input);
  const b = await readPackage(join(f.tree, "A.nomi", "children", "B.nomi"));
  expect(b.manifest.references[id]).toBe(f.doc.notes[0].id);
  await writeFile(join(f.tree, "A.nomi", "text", id + ".md"), "Shared edit");
  const d = await f.load();
  expect(d.blocks.find((b) => b.id === id)).toMatchObject({
    source: "Shared edit",
  });
  expect(d.notes[1].blocks).toContain(id);
  await f.put({ ...d, revision: d.revision + 1 }, d.revision);
  const standalone = await readPackageTree(f.tree, b.path);
  expect(standalone.document.blocks.find((b) => b.id === id)).toMatchObject({
    source: "Shared edit",
  });
});
it("rejects duplicate identities, symlink escape and future versions without replacing snapshots", async () => {
  const f = await fixture();
  const path = join(f.tree, "A.nomi");
  await cp(path, join(f.tree, "Copy.nomi"), { recursive: true });
  await expect(f.load()).rejects.toThrow("重复");
  await rm(join(f.tree, "Copy.nomi"), { recursive: true });
  const file = join(path, "document.json"),
    raw = await readFile(file, "utf8"),
    manifest = JSON.parse(raw);
  manifest.version = 999;
  await writeFile(file, JSON.stringify(manifest));
  await expect(f.load()).rejects.toThrow("版本");
  await writeFile(file, raw);
  const text = join(path, "text");
  await rename(text, text + "-saved");
  await symlink(text + "-saved", text);
  await expect(f.load()).rejects.toThrow("符号链接");
});
it("invalid or missing source can be repaired and then read without losing the previous data", async () => {
  const f = await fixture();
  const path = join(f.tree, "A.nomi", "document.json"),
    saved = await readFile(path);
  await writeFile(path, "{");
  await expect(f.load()).rejects.toThrow();
  await writeFile(path, saved);
  expect(await f.load()).toEqual(f.doc);
});
it("migrates legacy physical folders and retains the complete previous tree and DSL", async () => {
  const f = await fixture(false);
  const key =
    packageHash(JSON.stringify(["local-device", f.doc.id])) + ".nomi.json";
  const legacy = {
    format: "nomi-library-document/1",
    profile: "local-device",
    document: f.doc,
    originals: {},
    treeVersion: 1,
  };
  await commitTree(f.root, "文稿", key, legacy, f.doc);
  await writeFile(join(f.tree, "A", "keep.txt"), "legacy extra");
  expect(await f.load()).toEqual(f.doc);
  expect(await readdir(f.tree)).toContain("A.nomi");
  const histories = await readdir(join(f.root, ".nomi-history"));
  let backup = false;
  for (const h of histories) {
    try {
      expect(
        await readFile(
          join(f.root, ".nomi-history", h, "legacy-tree", "A", "keep.txt"),
          "utf8",
        ),
      ).toBe("legacy extra");
      backup = true;
    } catch {}
  }
  expect(backup).toBe(true);
});
it("rebuilds the workspace projection from packages if the cache file is missing", async () => {
  const f = await fixture();
  for (const file of await readdir(join(f.root, "workspaces")))
    await rm(join(f.root, "workspaces", file));
  expect(await f.load()).toEqual(f.doc);
});
it("portable title names handle duplicates and invalid filename characters", async () => {
  const f = await fixture(false);
  f.doc.notes[0].title = "A/B";
  f.doc.notes[1].title = "A/B";
  delete f.doc.notes[1].parentId;
  await f.store.save(f.input);
  expect((await readdir(f.tree)).sort()).toEqual([
    "A B (2).nomi",
    "A B.nomi",
    "画布.nomi",
  ]);
  expect(await f.load()).toEqual(f.doc);
});
it("resumes an interrupted file transaction without overwriting later external writes", async () => {
  const f = await fixture();
  const key =
      packageHash(JSON.stringify(["local-device", f.doc.id])) + ".nomi.json",
    token = "00000000-0000-4000-8000-000000000001";
  const source = `.nomi-history/${token}/staged/0`,
    target = "文稿/A.nomi/text/" + f.doc.notes[0].blocks[0] + ".md";
  await mkdir(join(f.root, ".nomi-history", token, "staged"), {
    recursive: true,
  });
  const old = await readFile(join(f.root, target));
  const next = Buffer.from("Recovered edit");
  await writeFile(join(f.root, source), next);
  const journal = {
    version: 1,
    token,
    cursor: 0,
    operations: [
      {
        type: "write",
        path: target,
        source,
        before: packageHash(old),
        after: packageHash(next),
      },
    ],
  };
  const pointer = join(f.root, "workspaces", key + ".package-journal");
  await writeFile(pointer, JSON.stringify(journal));
  await recoverPackages(f.root, key);
  expect(await readFile(join(f.root, target), "utf8")).toBe("Recovered edit");
  await writeFile(pointer, JSON.stringify(journal));
  await writeFile(join(f.root, target), "Newer external");
  await expect(recoverPackages(f.root, key)).rejects.toThrow("外部修改");
  expect(await readFile(join(f.root, target), "utf8")).toBe("Newer external");
});
it("opens a detached board with its complete note fallback, shapes, connectors and interaction sources", async () => {
  const f = await fixture(false);
  f.doc.blocks.push({
    id: "shape.test",
    type: "shape",
    shape: "diamond",
    text: "Decision",
    tone: "sage",
  });
  f.doc.board.placements.push({
    id: "place.shape",
    content: "shape.test",
    x: 50,
    y: 50,
    width: 120,
    height: 100,
  });
  f.doc.board.connectors = [
    {
      id: "connection.test",
      from: { placement: "place.start", side: "e" },
      to: { placement: "place.shape", side: "n" },
      routing: "rounded",
      style: "dashed",
      startArrow: false,
      endArrow: true,
      label: "link",
      waypoints: [{ x: 30, y: 40 }],
    },
  ];
  await f.store.save(f.input);
  const board = join(f.path, "Board.nomi");
  await cp(join(f.tree, "画布.nomi"), board, { recursive: true });
  expect((await readPackageTree(f.path, board)).document).toEqual(f.doc);
  const pkg = await readPackage(board);
  expect([...pkg.files.keys()].some((p) => p.startsWith("interactive/"))).toBe(
    true,
  );
});
it("reads sibling ordering from package childOrder and retains complete deletion backup", async () => {
  const f = await fixture();
  let d = applyCanvasCommands(f.doc, f.doc.revision, [
    {
      type: "add_note",
      note: {
        id: "note.third",
        title: "C",
        blocks: [],
        parentId: f.doc.notes[0].id,
      },
    },
  ]);
  await f.put(d, f.doc.revision);
  const file = join(f.tree, "A.nomi", "document.json");
  const m = JSON.parse(await readFile(file, "utf8"));
  m.childOrder.reverse();
  await writeFile(file, JSON.stringify(m));
  d = await f.load();
  expect(
    d.notes.filter((n) => n.parentId === f.doc.notes[0].id).map((n) => n.title),
  ).toEqual(["C", "B"]);
  const gone = applyCanvasCommands(d, d.revision, [
    { type: "delete_note", id: f.doc.notes[0].id },
  ]);
  await f.put(gone, d.revision);
  expect((await f.load()).notes).toHaveLength(0);
  const history = join(f.root, ".nomi-history");
  let saved = false;
  for (const token of await readdir(history)) {
    try {
      if (
        JSON.parse(await readFile(join(history, token, "before.json"), "utf8"))
          .document.revision === d.revision
      )
        saved = true;
    } catch {}
  }
  expect(saved).toBe(true);
});

it("keeps note icons in standalone packages and remaps image IDs on import", async () => {
  const f = await fixture(false);
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAusAAAAASUVORK5CYII=",
    "base64",
  );
  const asset = {
    id: "icon.portable",
    name: "icon.png",
    mime: "image/png",
    bytes: bytes.length,
    sha256: packageHash(bytes),
  };
  f.doc.assets.push(asset);
  f.doc.notes[0].icon = { type: "image", asset: asset.id };
  f.doc.notes[1].icon = { type: "emoji", value: "🧑🏽‍💻" };
  await f.store.save({ ...f.input, assets: [{ asset, bytes }] });
  expect((await f.load()).notes).toEqual(f.doc.notes);
  const a = await readPackage(join(f.tree, "A.nomi"));
  expect(a.assets.get(asset.id)).toEqual(bytes);
  const copy = join(f.path, "Icon.nomi");
  await cp(a.path, copy, { recursive: true });
  await rm(f.root, { recursive: true });
  const target = new DocumentStore(
    join(f.path, "target.json"),
    join(f.path, "target"),
  );
  await target.importPackage(copy);
  const loaded = (await target.load("local-device", "document.home"))!;
  const imported = loaded.notes.find((n) => n.icon?.type === "image")!;
  expect(imported.icon!.type).toBe("image");
  if (imported.icon?.type !== "image") throw Error("Image icon missing");
  expect(imported.icon.asset).not.toBe(asset.id);
  expect(
    (await target.asset("local-device", "document.home", imported.icon.asset))
      ?.bytes,
  ).toEqual(new Uint8Array(bytes));
  expect(
    loaded.notes.some((n) => n.icon?.type === "emoji" && n.icon.value === "🧑🏽‍💻"),
  ).toBe(true);
});

it("retains future manifest and document fields through external reads, editing, moving and reopening", async () => {
  const f = await fixture();
  for (const name of ["A.nomi", "画布.nomi"]) {
    const path = join(f.tree, name, "document.json");
    const raw = JSON.parse(await readFile(path, "utf8"));
    raw.futureManifest = { label: name };
    raw.document.futureDocument = { label: name };
    raw.document.board.futureBoard = { label: name };
    raw.document.notes[0].futureNote = { label: "retained" };
    raw.document.blocks[0].futureBlock = { label: "retained" };
    await writeFile(path, JSON.stringify(raw));
  }
  const loaded = await f.load();
  const edited = applyCanvasCommands(loaded, loaded.revision, [
    {
      type: "set_markdown",
      id: loaded.notes[0].blocks[0],
      source: "Edited with future metadata",
    },
    { type: "rename_note", id: loaded.notes[0].id, title: "Renamed" },
  ]);
  await f.put(edited, loaded.revision);
  for (const [name, original] of [
    ["Renamed.nomi", "A.nomi"],
    ["画布.nomi", "画布.nomi"],
  ]) {
    const raw = JSON.parse(
      await readFile(join(f.tree, name, "document.json"), "utf8"),
    );
    expect(raw.futureManifest).toEqual({ label: original });
    expect(raw.document.futureDocument).toEqual({ label: original });
    expect(raw.document.board.futureBoard).toEqual({ label: original });
    expect(raw.document.notes[0].futureNote).toEqual({ label: "retained" });
    expect(raw.document.blocks[0].futureBlock).toEqual({ label: "retained" });
  }
  expect(
    await new DocumentStore(f.config, f.root).load(f.input.profile, f.doc.id),
  ).toEqual(edited);
  // No revision churn on unchanged reads, and package-local metadata survives subsequent writes.
  expect(await f.load()).toEqual(edited);
});

it("retains extension fields on interactive file declarations without relaxing the program", async () => {
  const f = await fixture();
  const path = join(f.tree, "画布.nomi", "document.json");
  const raw = JSON.parse(await readFile(path, "utf8"));
  const block = raw.document.blocks.find((b: any) => b.type === "interactive");
  block.futureDescription = { text: "Learning" };
  await writeFile(path, JSON.stringify(raw));
  const loaded = await f.load();
  expect(loaded.blocks.find((b) => b.id === block.id)).toHaveProperty(
    "futureDescription",
    block.futureDescription,
  );
  const saved = JSON.parse(await readFile(path, "utf8"));
  expect(
    saved.document.blocks.find((b: any) => b.id === block.id).futureDescription,
  ).toEqual(block.futureDescription);
});

it("round trips note reference blocks and remaps only imported targets", async () => {
  const f = await fixture(false);
  f.doc.blocks.push(
    {
      id: "ref.child",
      type: "note-reference",
      documentId: f.doc.id,
      noteId: f.doc.notes[1].id,
      title: "B",
    },
    {
      id: "ref.external",
      type: "note-reference",
      documentId: "document.external",
      noteId: "note.external",
      title: "External",
    },
  );
  f.doc.notes[0].blocks.push("ref.child", "ref.external");
  await f.store.save(f.input);
  expect((await f.load()).blocks).toEqual(f.doc.blocks);
  const single = await readPackage(join(f.tree, "A.nomi"));
  expect(
    single.document.blocks.find((b) => b.id === "ref.child"),
  ).toMatchObject({ type: "note-reference", noteId: f.doc.notes[1].id });
  const copy = join(f.path, "Copy.nomi");
  await cp(join(f.tree, "A.nomi"), copy, { recursive: true });
  const root = await f.store.importPackage(copy);
  const next = await f.load(),
    parent = next.notes.find((n) => n.id === root)!;
  const child = next.notes.find((n) => n.parentId === root)!;
  const references = next.blocks.filter(
    (b) => parent.blocks.includes(b.id) && b.type === "note-reference",
  );
  expect(references).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ noteId: child.id, documentId: next.id }),
      expect.objectContaining({
        noteId: "note.external",
        documentId: "document.external",
      }),
    ]),
  );
});
