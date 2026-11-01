import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import {
  parseCanvasDocument,
  CANVAS_ASSET_BYTES,
  type CanvasDocument,
  type CanvasBlock,
  type CanvasAsset,
} from "../../core/src/canvas/index";
import { regularFile, directory } from "./document-files";

export const packageHash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
export const packageName = (title: string) => {
  let name =
    title
      .normalize("NFC")
      .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, " ")
      .trim()
      .replace(/^[. ]+|[. ]+$/g, "") || "未命名文稿";
  while (Buffer.byteLength(name) > 170) name = [...name].slice(0, -1).join("");
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name += " 文稿";
  return name + ".nomi";
};
export interface PackageManifest {
  format: "nomi-package";
  version: 1;
  kind: "note" | "board";
  packageId: string;
  fileName: string;
  publishedTitle: string;
  /** References have a portable fallback in document; the named package owns live content. */
  references: Record<string, string>;
  childOrder: string[];
  noteOrder: string[];
  assetPaths: Record<string, string>;
  document: CanvasDocument;
}
export interface ReadPackage {
  path: string;
  manifest: PackageManifest;
  document: CanvasDocument;
  parentId?: string;
  files: Map<string, Buffer>;
  assets: Map<string, Buffer>;
}
export async function packageFile(root: string, path: string, limit: number) {
  if (
    !path ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.split("/").some((s) => !s || s === "." || s === "..") ||
    path.includes("\0")
  )
    throw Error("文稿包包含不安全的资源路径。");
  const segments = path.split("/");
  await directory(root);
  for (let i = 1; i < segments.length; i++)
    await directory(join(root, ...segments.slice(0, i)));
  return regularFile(join(root, path), limit);
}
export async function readPackage(path: string): Promise<ReadPackage> {
  await directory(path);
  const files = new Map<string, Buffer>();
  const read = async (name: string, limit: number) => {
    const bytes = await packageFile(path, name, limit);
    files.set(name, bytes);
    return bytes;
  };
  const raw = JSON.parse(
    (await read("document.json", 4 * 1024 * 1024)).toString(),
  );
  const allowed = [
    "format",
    "version",
    "kind",
    "packageId",
    "fileName",
    "publishedTitle",
    "references",
    "childOrder",
    "noteOrder",
    "assetPaths",
    "document",
  ];
  if (
    !raw ||
    Object.keys(raw).some((k) => !allowed.includes(k)) ||
    raw.format !== "nomi-package" ||
    raw.version !== 1 ||
    !["note", "board"].includes(raw.kind)
  )
    throw Error("不支持此文稿包版本或字段，原文件保持不变。");
  const object = (v: unknown) =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (
    !object(raw.references) ||
    !object(raw.assetPaths) ||
    !Array.isArray(raw.childOrder) ||
    !Array.isArray(raw.noteOrder) ||
    raw.childOrder.length > 100 ||
    raw.noteOrder.length > 100 ||
    [...raw.childOrder, ...raw.noteOrder].some((x) => typeof x !== "string") ||
    typeof raw.publishedTitle !== "string" ||
    raw.publishedTitle.length > 200 ||
    typeof raw.fileName !== "string" ||
    raw.fileName.length > 250 ||
    !object(raw.document) ||
    !Array.isArray(raw.document.blocks)
  )
    throw Error("文稿包结构无效。");
  const decoded = structuredClone(raw.document);
  for (const block of decoded.blocks) {
    if (block.type === "markdown")
      block.source = (await read(block.source, 2 * 1024 * 1024)).toString(
        "utf8",
      );
    else if (block.type === "interactive") {
      if (Object.keys(block).some((k) => !["id", "type", "source"].includes(k)))
        throw Error("交互块文件声明无效。");
      block.program = JSON.parse(
        (await read(block.source, 2 * 1024 * 1024)).toString(),
      );
      delete block.source;
    }
  }
  const document = parseCanvasDocument(decoded);
  if (
    typeof raw.packageId !== "string" ||
    (raw.kind === "note"
      ? document.notes.length !== 1 ||
        document.notes[0].id !== raw.packageId ||
        !!document.notes[0].parentId
      : document.id !== raw.packageId)
  )
    throw Error("文稿包身份无效。");
  for (const [id, owner] of Object.entries(raw.references)) {
    if (
      !document.blocks.some((b) => b.id === id) ||
      typeof owner !== "string" ||
      !/^[a-zA-Z][\w.-]{0,95}$/.test(owner) ||
      owner === raw.packageId
    )
      throw Error("共享内容引用无效。");
  }
  const assets = new Map<string, Buffer>();
  for (const a of document.assets) {
    const bytes = await read(raw.assetPaths[a.id], CANVAS_ASSET_BYTES);
    if (bytes.length !== a.bytes || packageHash(bytes) !== a.sha256)
      throw Error("文稿包附件缺失或损坏。");
    assets.set(a.id, bytes);
  }
  // Reject half-written metadata even when the old source set happened to validate.
  if (
    !(await packageFile(path, "document.json", 4 * 1024 * 1024)).equals(
      files.get("document.json")!,
    )
  )
    throw Error("文稿包正在被修改，请稍后重试。");
  for (const [name, bytes] of files) {
    if (
      !name.startsWith("assets/") &&
      !(await packageFile(path, name, 4 * 1024 * 1024)).equals(bytes)
    )
      throw Error("文稿包正在被修改，请稍后重试。");
  }
  return { path, manifest: raw, document, files, assets };
}
export function encodePackage(
  document: CanvasDocument,
  kind: "note" | "board",
  packageId: string,
  fileName: string,
  references: Record<string, string>,
  childOrder: string[],
  noteOrder: string[],
  originals: Map<string, Buffer>,
) {
  const files = new Map<string, Buffer>();
  const encoded: any = structuredClone(parseCanvasDocument(document));
  if (kind === "note") encoded.title = document.notes[0].title;
  for (const b of encoded.blocks) {
    if (b.type === "markdown") {
      const path = `text/${b.id}.md`;
      files.set(path, Buffer.from(b.source));
      b.source = path;
    } else if (b.type === "interactive") {
      const path = `interactive/${b.id}.nomi-ui.json`;
      files.set(path, Buffer.from(json(b.program)));
      delete b.program;
      b.source = path;
    }
  }
  const assetPaths: Record<string, string> = Object.create(null);
  for (const a of document.assets) {
    const ext =
      (
        {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
          "image/gif": "gif",
          "application/pdf": "pdf",
        } as Record<string, string>
      )[a.mime] ?? "bin";
    const path = `assets/${a.sha256}.${ext}`,
      bytes = originals.get(a.id);
    if (!bytes || bytes.length !== a.bytes || packageHash(bytes) !== a.sha256)
      throw Error("缺少文稿包原件。");
    assetPaths[a.id] = path;
    files.set(path, bytes);
  }
  const manifest: PackageManifest = {
    format: "nomi-package",
    version: 1,
    kind,
    packageId,
    fileName,
    publishedTitle: kind === "note" ? document.notes[0].title : document.title,
    references,
    childOrder,
    noteOrder,
    assetPaths,
    document: encoded,
  };
  files.set("document.json", Buffer.from(json(manifest)));
  return files;
}
export interface PackageTree {
  entries: ReadPackage[];
  board: ReadPackage;
  document: CanvasDocument;
  originals: Map<string, Buffer>;
  fingerprint: string;
}
export async function readPackageTree(
  root: string,
  standalone?: string,
): Promise<PackageTree> {
  await directory(root);
  const entries: ReadPackage[] = [],
    ids = new Set<string>();
  const visit = async (path: string, parentId?: string) => {
    const entry = await readPackage(path);
    if (ids.has(entry.manifest.packageId))
      throw Error("发现重复文稿包身份，请使用独立副本导入。");
    ids.add(entry.manifest.packageId);
    if (entries.length >= 101) throw Error("文稿包数量超过当前上限。");
    entry.parentId = parentId;
    entries.push(entry);
    const children = join(path, "children");
    try {
      await directory(children);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const name of (await readdir(children)).sort())
      if (name.endsWith(".nomi"))
        await visit(join(children, name), entry.manifest.packageId);
  };
  if (standalone) await visit(standalone);
  else
    for (const name of (await readdir(root)).sort())
      if (name.endsWith(".nomi")) await visit(join(root, name));
  const boards = entries.filter((e) => e.manifest.kind === "board");
  if (boards.length > 1 || (!standalone && boards.length !== 1))
    throw Error("工作区需要且只能有一个画布文稿包。");
  const board = boards[0] ?? entries[0];
  if (!board) throw Error("没有可读取的文稿包。");
  const notes = entries.filter((e) => e.manifest.kind === "note");
  const order = new Map(board.manifest.noteOrder.map((id, i) => [id, i]));
  notes.sort(
    (a, b) =>
      (order.get(a.manifest.packageId) ?? 1000) -
      (order.get(b.manifest.packageId) ?? 1000),
  );
  // A physical parent's childOrder is authoritative for that sibling group.
  for (const parentId of new Set(notes.map((e) => e.parentId))) {
    const parent = entries.find((e) => e.manifest.packageId === parentId);
    const order =
      parent?.manifest.childOrder ??
      (board.manifest.kind === "board" ? board.manifest.childOrder : []);
    const slots = notes
      .map((e, i) => (e.parentId === parentId ? i : -1))
      .filter((i) => i >= 0);
    const siblings = slots.map((i) => notes[i]);
    const rank = (id: string) => {
      const n = order.indexOf(id);
      return n < 0 ? 1000 : n;
    };
    siblings.sort(
      (a, b) => rank(a.manifest.packageId) - rank(b.manifest.packageId),
    );
    slots.forEach((slot, i) => {
      notes[slot] = siblings[i];
    });
  }
  // Keep global note array order when topology/order has not changed; physical nesting determines parentId.
  let noteValues = notes.map((e) => {
    const note = { ...e.document.notes[0] };
    const baseline = e.manifest.publishedTitle;
    if (e.document.title !== baseline) {
      if (note.title !== baseline && note.title !== e.document.title)
        throw Error("文稿包中的两个标题同时变化，请统一标题后重试。");
      note.title = e.document.title;
    }
    if (basename(e.path) !== e.manifest.fileName && note.title !== baseline)
      throw Error("文件包名称和内部标题同时变化，请先统一标题。");
    delete note.parentId;
    if (e.parentId) note.parentId = e.parentId;
    if (basename(e.path) !== e.manifest.fileName)
      note.title = basename(e.path).replace(/\.nomi$/, "");
    return note;
  });
  if (standalone && board.manifest.kind === "board") {
    const actual = new Map(noteValues.map((n) => [n.id, n]));
    noteValues = [
      ...board.document.notes.map((n) => actual.get(n.id) ?? n),
      ...noteValues.filter(
        (n) => !board.document.notes.some((old) => old.id === n.id),
      ),
    ];
  }
  const canonical = new Map<string, CanvasBlock>();
  const owners = new Map<string, string>();
  for (const e of entries)
    for (const b of e.document.blocks)
      if (!e.manifest.references[b.id]) {
        if (canonical.has(b.id))
          throw Error("多个文稿包声明拥有同一个内容块。");
        canonical.set(b.id, b);
        owners.set(b.id, e.manifest.packageId);
      }
  for (const e of entries)
    for (const b of e.document.blocks) {
      const owner = e.manifest.references[b.id];
      if (owner && ids.has(owner) && owners.get(b.id) !== owner)
        throw Error("共享内容所有者与引用不一致。");
      if (!canonical.has(b.id)) canonical.set(b.id, b); // Standalone portable snapshot; no inaccessible original required.
    }
  const blockOrder = [
    ...board.document.blocks.map((b) => b.id),
    ...canonical.keys(),
  ];
  const blocks = [...new Set(blockOrder)]
    .filter((id) => canonical.has(id))
    .map((id) => canonical.get(id)!);
  const assets = new Map<string, CanvasAsset>(),
    originals = new Map<string, Buffer>();
  for (const e of [board, ...entries.filter((e) => e !== board)])
    for (const a of e.document.assets) {
      const old = assets.get(a.id);
      if (old && JSON.stringify(old) !== JSON.stringify(a))
        throw Error("附件身份冲突。");
      assets.set(a.id, a);
      originals.set(a.id, e.assets.get(a.id)!);
    }
  const contents = new Set([
    ...blocks.map((b) => b.id),
    ...noteValues.map((n) => n.id),
  ]);
  const placements = board.document.board.placements.filter((p) =>
    contents.has(p.content),
  );
  const pids = new Set(placements.map((p) => p.id));
  const document = parseCanvasDocument({
    ...board.document,
    notes: noteValues,
    blocks,
    assets: [...assets.values()],
    board: {
      ...board.document.board,
      placements,
      ...(board.document.board.connectors
        ? {
            connectors: board.document.board.connectors.filter(
              (c) =>
                (!c.from.placement || pids.has(c.from.placement)) &&
                (!c.to.placement || pids.has(c.to.placement)),
            ),
          }
        : {}),
    },
  });
  const fingerprint = packageHash(
    JSON.stringify(
      entries.map((e) => [
        e.path.slice(root.length),
        [...e.files].map(([p, b]) => [p, packageHash(b)]),
      ]),
    ),
  );
  return { entries, board, document, originals, fingerprint };
}
export function planPackages(
  document: CanvasDocument,
  previous: PackageTree | undefined,
  originals: Map<string, Buffer>,
) {
  const oldOwners = new Map<string, string>();
  for (const e of previous?.entries ?? [])
    for (const b of e.document.blocks)
      if (!e.manifest.references[b.id])
        oldOwners.set(b.id, e.manifest.packageId);
  const owners = new Map<string, string>();
  for (const b of document.blocks) {
    const users = document.notes.filter((n) => n.blocks.includes(b.id));
    const old = oldOwners.get(b.id);
    owners.set(
      b.id,
      users.find((n) => n.id === old)?.id ?? users[0]?.id ?? document.id,
    );
  }
  const paths = new Map<string, string>([[document.id, "画布.nomi"]]);
  const used = new Map<string, Set<string>>([["", new Set(["画布.nomi"])]]);
  const pathFor = (id: string): string => {
    if (paths.has(id)) return paths.get(id)!;
    const note = document.notes.find((n) => n.id === id)!;
    const parent = note.parentId ? pathFor(note.parentId) + "/children" : "";
    const names = used.get(parent) ?? new Set<string>();
    used.set(parent, names);
    const base = packageName(note.title);
    let name = base,
      i = 1;
    while (names.has(name.toLowerCase()))
      name = base.replace(/\.nomi$/, ` (${++i}).nomi`);
    names.add(name.toLowerCase());
    const path = parent ? parent + "/" + name : name;
    paths.set(id, path);
    return path;
  };
  const result = new Map<
    string,
    { path: string; files: Map<string, Buffer> }
  >();
  const refs = (blocks: CanvasBlock[], id: string) =>
    Object.fromEntries(
      blocks
        .filter((b) => owners.get(b.id) !== id)
        .map((b) => [b.id, owners.get(b.id)!]),
    );
  // Board contains explicitly referenced portable snapshots; note packages own note content.
  result.set(document.id, {
    path: "画布.nomi",
    files: encodePackage(
      document,
      "board",
      document.id,
      "画布.nomi",
      refs(document.blocks, document.id),
      document.notes.filter((n) => !n.parentId).map((n) => n.id),
      document.notes.map((n) => n.id),
      originals,
    ),
  });
  for (const n of document.notes) {
    const blocks = n.blocks.map((id) =>
      document.blocks.find((b) => b.id === id)!,
    );
    const assetIds = new Set(
      blocks.flatMap((b) => ("asset" in b ? [b.asset] : [])),
    );
    const { parentId: _, ...note } = n;
    const contents = new Set([n.id, ...n.blocks]);
    const placements = document.board.placements.filter((p) =>
      contents.has(p.content),
    );
    const ids = new Set(placements.map((p) => p.id));
    const doc: CanvasDocument = {
      schema: document.schema,
      id: document.id,
      title: n.title,
      revision: 1,
      notes: [note],
      blocks,
      assets: document.assets.filter((a) => assetIds.has(a.id)),
      board: {
        id: document.board.id,
        placements,
        ...(document.board.connectors
          ? {
              connectors: document.board.connectors.filter(
                (c) =>
                  (!c.from.placement || ids.has(c.from.placement)) &&
                  (!c.to.placement || ids.has(c.to.placement)),
              ),
            }
          : {}),
      },
    };
    const path = pathFor(n.id);
    result.set(n.id, {
      path,
      files: encodePackage(
        doc,
        "note",
        n.id,
        basename(path),
        refs(blocks, n.id),
        document.notes.filter((c) => c.parentId === n.id).map((c) => c.id),
        [],
        originals,
      ),
    });
  }
  return result;
}
