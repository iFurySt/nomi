import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, lstat, rename, rm, cp } from "node:fs/promises";
import { join, basename } from "node:path";
import {
  parseCanvasDocument,
  type CanvasDocument,
  type CanvasNote,
} from "../../core/src/canvas/index";
import { atomicFile, directory, regularFile } from "./document-files";

const markerName = ".nomi-note.json";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";
export const treeFolder = (profile: string, id: string) =>
  profile === "local-device" && id === "document.home"
    ? "文稿"
    : `文稿-${digest(JSON.stringify([profile, id]))}`;
export const treeStructure = (doc: CanvasDocument) =>
  JSON.stringify(
    doc.notes.map(({ id, title, parentId }) => ({ id, title, parentId })),
  );
interface Marker {
  version: 1;
  id: string;
  title: string;
  name: string;
  order: number;
}
export interface TreeEntry {
  path: string;
  parentId?: string;
  marker: Marker;
}
export interface TreeScan {
  root: string;
  entries: TreeEntry[];
  fingerprint: string;
}
async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if (missing(e)) return false;
    throw e;
  }
}
function validMarker(value: Marker) {
  if (
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.id) ||
    typeof value.title !== "string" ||
    value.title.length > 200 ||
    typeof value.name !== "string" ||
    !Number.isInteger(value.order) ||
    value.order < 0
  )
    throw Error("文稿目录身份文件无效，请恢复 .nomi-note.json。");
}
export async function scanTree(
  root: string,
  initializeNew = true,
): Promise<TreeScan> {
  await directory(root);
  const entries: TreeEntry[] = [],
    ids = new Set<string>();
  async function visit(path: string, parentId?: string, depth = 0) {
    if (depth > 100) throw Error("文稿目录层级过深。");
    for (const name of (await readdir(path)).sort()) {
      if (name.startsWith(".")) continue;
      const child = join(path, name),
        stat = await lstat(child);
      if (stat.isSymbolicLink()) throw Error("文稿目录不能包含符号链接。");
      if (!stat.isDirectory()) continue;
      let marker: Marker;
      try {
        marker = JSON.parse(
          (await regularFile(join(child, markerName), 4096)).toString(),
        );
        validMarker(marker);
      } catch (e) {
        if (!missing(e) || !initializeNew) throw e;
        if (name.length > 200) throw Error("文稿文件夹名称最多 200 个字符。");
        marker = {
          version: 1,
          id: `note_${randomUUID()}`,
          title: name,
          name,
          order: 100000,
        };
        await atomicFile(
          join(child, markerName),
          JSON.stringify(marker, null, 2),
        );
      }
      if (ids.has(marker.id))
        throw Error("发现重复文稿身份，请勿直接复制带身份文件的文稿文件夹。");
      ids.add(marker.id);
      if (entries.length >= 100) throw Error("当前工作区最多支持 100 篇文稿。");
      entries.push({ path: child, parentId, marker });
      await visit(child, marker.id, depth + 1);
    }
  }
  await visit(root);
  entries.sort(
    (a, b) => a.marker.order - b.marker.order || a.path.localeCompare(b.path),
  );
  return {
    root,
    entries,
    fingerprint: digest(
      JSON.stringify(
        entries.map((e) => ({
          path: e.path.slice(root.length),
          parentId: e.parentId,
          marker: e.marker,
        })),
      ),
    ),
  };
}
/** Physical parent and name win; prose and shared blocks keep their stable identity. */
export function readTreeDocument(
  document: CanvasDocument,
  scan: TreeScan,
): CanvasDocument {
  const old = new Map(document.notes.map((n) => [n.id, n]));
  const blocks = [...document.blocks];
  const notes: CanvasNote[] = scan.entries.map(
    ({ path, marker, parentId }) => ({
      id: marker.id,
      title: basename(path) === marker.name ? marker.title : basename(path),
      blocks:
        old.get(marker.id)?.blocks ??
        (() => {
          const id = `block_${randomUUID()}`;
          blocks.push({ id, type: "markdown", source: "" });
          return [id];
        })(),
      ...(parentId ? { parentId } : {}),
    }),
  );
  const retained = new Set([
    ...notes.map((n) => n.id),
    ...document.blocks.map((b) => b.id),
  ]);
  const placements = document.board.placements.filter((p) =>
    retained.has(p.content),
  );
  const placementIds = new Set(placements.map((p) => p.id));
  return parseCanvasDocument({
    ...document,
    blocks,
    notes,
    board: {
      ...document.board,
      placements,
      ...(document.board.connectors
        ? {
            connectors: document.board.connectors.filter(
              (c) =>
                (!c.from.placement || placementIds.has(c.from.placement)) &&
                (!c.to.placement || placementIds.has(c.to.placement)),
            ),
          }
        : {}),
    },
  });
}
function folderName(title: string) {
  let name = title
    .normalize("NFC")
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");
  if (!name) name = "未命名文稿";
  while (Buffer.byteLength(name, "utf8") > 170)
    name = [...name].slice(0, -1).join("");
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name += " 文稿";
  return name;
}
async function copySafe(source: string, target: string) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
    throw Error("文稿目录含有不支持的文件类型。");
  if (stat.isDirectory()) {
    await mkdir(target);
    for (const name of await readdir(source))
      await copySafe(join(source, name), join(target, name));
  } else await cp(source, target, { errorOnExist: true, force: false });
}
/** Also used by directory relocation, never follows symbolic links. */
export { copySafe };
export async function prepareTree(
  target: string,
  document: CanvasDocument,
  previous?: TreeScan,
) {
  await mkdir(target);
  if (previous) {
    const roots = new Set(
      previous.entries.filter((e) => !e.parentId).map((e) => e.path),
    );
    for (const name of await readdir(previous.root)) {
      if (!roots.has(join(previous.root, name)))
        await copySafe(join(previous.root, name), join(target, name));
    }
  }
  const old = new Map(previous?.entries.map((e) => [e.marker.id, e]));
  const names = new Map<string, Set<string>>();
  const paths = new Map<string, string>();
  async function place(note: CanvasNote): Promise<string> {
    if (paths.has(note.id)) return paths.get(note.id)!;
    const parent = note.parentId
      ? await place(document.notes.find((n) => n.id === note.parentId)!)
      : target;
    const siblings =
      names.get(parent) ??
      new Set((await readdir(parent)).map((n) => n.toLocaleLowerCase()));
    names.set(parent, siblings);
    const base = folderName(note.title);
    let name = base,
      i = 1;
    while (siblings.has(name.toLocaleLowerCase())) name = `${base} (${++i})`;
    siblings.add(name.toLocaleLowerCase());
    const path = join(parent, name);
    await mkdir(path);
    paths.set(note.id, path);
    const before = old.get(note.id);
    if (before) {
      const childPaths = new Set(
        previous!.entries
          .filter((e) => e.parentId === note.id)
          .map((e) => e.path),
      );
      for (const name of await readdir(before.path)) {
        if (name === markerName || childPaths.has(join(before.path, name)))
          continue;
        await copySafe(join(before.path, name), join(path, name));
      }
    }
    const marker: Marker = {
      version: 1,
      id: note.id,
      title: note.title,
      name,
      order: document.notes.findIndex((n) => n.id === note.id),
    };
    await atomicFile(join(path, markerName), JSON.stringify(marker, null, 2));
    return path;
  }
  for (const note of document.notes) await place(note);
}
interface Journal {
  version: 1;
  token: string;
  folder: string;
  snapshotFile: string;
}
const safeChild = (s: unknown): s is string =>
  typeof s === "string" && !!s && basename(s) === s && s !== "." && s !== "..";
export async function recoverTree(root: string, snapshotFile: string) {
  const journalFile = join(root, "workspaces", `${snapshotFile}.tree-journal`);
  let journal: Journal;
  try {
    journal = JSON.parse((await regularFile(journalFile, 4096)).toString());
  } catch (e) {
    if (missing(e)) return;
    throw e;
  }
  if (
    journal.version !== 1 ||
    !/^[a-f0-9-]{36}$/.test(journal.token) ||
    !safeChild(journal.folder) ||
    !/^文稿(?:-[a-f0-9]{64})?$/.test(journal.folder) ||
    journal.snapshotFile !== snapshotFile
  )
    throw Error("目录恢复日志无效。");
  const transaction = join(root, ".nomi-history", journal.token);
  await directory(join(root, ".nomi-history"));
  await directory(transaction);
  const next = join(transaction, "next"),
    old = join(transaction, "previous"),
    tree = join(root, journal.folder);
  const snapshot = await regularFile(
    join(transaction, "snapshot.json"),
    32 * 1024 * 1024,
  );
  const staged = JSON.parse(snapshot.toString());
  parseCanvasDocument(staged.document);
  if (
    digest(JSON.stringify([staged.profile, staged.document.id])) +
      ".nomi.json" !==
    snapshotFile
  )
    throw Error("目录恢复文档身份不一致。");
  if (await exists(next)) {
    if (await exists(tree)) {
      if (await exists(old))
        throw Error("恢复时发现额外目录，请保留文件并检查目录日志。");
      await rename(tree, old);
    }
    await rename(next, tree);
  }
  await directory(tree);
  await atomicFile(join(root, "workspaces", snapshotFile), snapshot);
  await rm(journalFile);
}
export async function commitTree(
  root: string,
  folder: string,
  snapshotFile: string,
  snapshot: object,
  document: CanvasDocument,
  previous?: TreeScan,
) {
  const history = join(root, ".nomi-history");
  await mkdir(history, { recursive: true });
  await directory(history);
  const token = randomUUID(),
    transaction = join(history, token);
  await mkdir(transaction);
  try {
    const before = await regularFile(
      join(root, "workspaces", snapshotFile),
      32 * 1024 * 1024,
    );
    await atomicFile(join(transaction, "before.json"), before);
  } catch (e) {
    if (!missing(e)) throw e;
  }
  await prepareTree(join(transaction, "next"), document, previous);
  if (
    previous &&
    (await scanTree(join(root, folder), false)).fingerprint !==
      previous.fingerprint
  )
    throw Error("Finder 中的目录已改变，请先读取最新层级。");
  if (!previous && (await exists(join(root, folder))))
    throw Error("文稿目录已存在，不能覆盖。");
  await atomicFile(
    join(transaction, "snapshot.json"),
    JSON.stringify(snapshot, null, 2) + "\n",
  );
  await atomicFile(
    join(root, "workspaces", `${snapshotFile}.tree-journal`),
    JSON.stringify({
      version: 1,
      token,
      folder,
      snapshotFile,
    } satisfies Journal),
  );
  await recoverTree(root, snapshotFile);
}
