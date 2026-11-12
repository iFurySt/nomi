import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { regularFile, directory } from "./document-files";
import { readPackageTree, planPackages } from "./nomi-package";
import {
  blockAssetIds,
  newCanvasId,
  noteSubtreeIds,
  parseCanvasDocument,
  remapCanvasAssets,
  type CanvasDocument,
  type CanvasAsset,
} from "../../core/src/canvas/index";
import { applyOperations, findNote } from "../../core/src/automation/document";
import type { DocumentAssetBytes } from "../../core/src/document-storage";
export function absolutePath(path: string) {
  if (!isAbsolute(path) || path.includes("\0"))
    throw Error("INVALID_PATH: Use an absolute local path.");
  return resolve(path);
}
function raster(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString()))
    return "image/gif";
  if (
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  return undefined;
}
export async function importAsset(
  d: CanvasDocument,
  p: any,
  decodeImage?: (b: Uint8Array) => boolean,
) {
  const path = absolutePath(p.path),
    bytes = new Uint8Array(await regularFile(path, 20 * 1024 * 1024));
  const mime = raster(bytes);
  if (p.display === "image" && (!mime || !decodeImage?.(bytes)))
    throw Error(
      "INVALID_IMAGE: Image must be a decodable PNG, JPEG, GIF or WebP.",
    );
  const asset: CanvasAsset = {
    id: newCanvasId("asset"),
    name: basename(path),
    mime:
      mime ??
      (Buffer.from(bytes).subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : "application/octet-stream"),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const next = applyOperations({ ...d, assets: [...d.assets, asset] }, [
    {
      type: "insert_blocks",
      noteId: p.noteId,
      blocks: [{ type: p.display, asset: asset.id }],
      ...(p.beforeBlockId ? { beforeBlockId: p.beforeBlockId } : {}),
    },
  ]);
  return {
    ...next,
    assets: [{ asset, bytes }],
    result: { assetId: asset.id, inserted: next.results },
  };
}
export async function importNote(d: CanvasDocument, p: any) {
  const path = absolutePath(p.path);
  if (p.parentId) findNote(d, p.parentId);
  if (p.format === "markdown") {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(
      await regularFile(path, 800000),
    );
    const next = applyOperations(d, [
      {
        type: "create_note",
        title: p.title ?? basename(path).replace(/\.(md|markdown)$/i, ""),
        markdown: source,
        ...(p.parentId ? { parentId: p.parentId } : {}),
      },
    ]);
    return {
      ...next,
      assets: [] as DocumentAssetBytes[],
      result: next.results[0],
    };
  }
  if (!path.endsWith(".nomi"))
    throw Error("INVALID_PACKAGE: Expected a .nomi directory.");
  const tree = await readPackageTree(dirname(path), path),
    source = tree.document;
  if (tree.board.manifest.kind !== "note")
    throw Error(
      "INVALID_PACKAGE: import_note requires a note package, not a whole canvas workspace.",
    );
  const ids = new Map<string, string>();
  const fresh = (id: string) => {
    if (!ids.has(id)) ids.set(id, newCanvasId("import"));
    return ids.get(id)!;
  };
  [...source.notes, ...source.blocks, ...source.assets].forEach((x) =>
    fresh(x.id),
  );
  const notes = source.notes.map((n) => ({
    ...n,
    id: fresh(n.id),
    blocks: n.blocks.map(fresh),
    ...(n.icon?.type === "image"
      ? { icon: { ...n.icon, asset: fresh(n.icon.asset) } }
      : {}),
    ...(n.parentId
      ? { parentId: fresh(n.parentId) }
      : p.parentId
        ? { parentId: p.parentId }
        : {}),
  }));
  if (p.title !== undefined && notes[0]) notes[0].title = p.title;
  const blocks = source.blocks.map((b) => ({
    ...remapCanvasAssets(b, fresh),
    id: fresh(b.id),
    ...(b.type === "note-reference" &&
    b.documentId === source.id &&
    source.notes.some((n) => n.id === b.noteId)
      ? { noteId: fresh(b.noteId), documentId: d.id }
      : {}),
  }));
  const assets = source.assets.map((a) => ({
    asset: { ...a, id: fresh(a.id) },
    bytes: new Uint8Array(tree.originals.get(a.id) ?? []),
  }));
  const document = parseCanvasDocument({
    ...d,
    revision: d.revision + 1,
    notes: [...d.notes, ...notes],
    blocks: [...d.blocks, ...blocks],
    assets: [...d.assets, ...assets.map((a) => a.asset)],
  });
  return { document, assets, result: { noteIds: notes.map((n) => n.id) } };
}
export async function exportNote(
  d: CanvasDocument,
  p: any,
  asset: (id: string) => Promise<Uint8Array>,
) {
  const path = absolutePath(p.path),
    root = findNote(d, p.noteId);
  // mkdir without recursive/exist-ok reserves a new destination; never overwrites user files.
  await directory(dirname(path));
  await mkdir(path, { mode: 0o700 });
  try {
    const ids = p.includeChildren
      ? noteSubtreeIds(d.notes, root.id)
      : new Set([root.id]);
    const notes = d.notes
      .filter((n) => ids.has(n.id))
      .map((n) => {
        const copy = { ...n };
        if (!copy.parentId || !ids.has(copy.parentId)) delete copy.parentId;
        return copy;
      });
    const blockIds = new Set(notes.flatMap((n) => n.blocks)),
      blocks = d.blocks.filter((b) => blockIds.has(b.id));
    const assetIds = new Set([
      ...blocks.flatMap(blockAssetIds),
      ...notes.flatMap((n) => (n.icon?.type === "image" ? [n.icon.asset] : [])),
    ]);
    const snapshot = parseCanvasDocument({
      ...d,
      revision: 1,
      notes,
      blocks,
      assets: d.assets.filter((a) => assetIds.has(a.id)),
      board: { id: d.board.id, placements: [] },
    });
    // Transport receipts are local metadata, not portable authoring content.
    delete (snapshot as any).automationReceipt;
    const originals = new Map<string, Buffer>();
    for (const a of snapshot.assets)
      originals.set(a.id, Buffer.from(await asset(a.id)));
    const files: string[] = [];
    const warnings = new Set<string>();
    for (const [id, pkg] of planPackages(snapshot, undefined, originals)) {
      if (id === snapshot.id) continue;
      for (const [relative, bytes] of pkg.files) {
        const target = join(path, pkg.path, relative);
        if (!target.startsWith(path + sep)) throw Error("Invalid export path.");
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
        files.push(target);
      }
    }
    if (p.format === "markdown") {
      for (const n of notes) {
        const name = n.id.replace(/[^\w.-]/g, "_");
        const parts = n.blocks.map((id) => {
          const b = blocks.find((b) => b.id === id)!;
          if (b.type === "markdown") return b.source;
          if (b.type === "image" || b.type === "file") {
            const a = snapshot.assets.find((a) => a.id === b.asset)!;
            return `${b.type === "image" ? "!" : ""}[${a.name.replace(/[\[\]\\\r\n]/g, " ")}](assets/${a.sha256})`;
          }
          warnings.add(
            "Markdown keeps special blocks as companion .nomi content; open the companion package for native rendering.",
          );
          return `<!-- Nomi ${b.type}: ${b.id}; see companion .nomi package -->`;
        });
        const file = join(path, `${name}.md`);
        await writeFile(
          file,
          `# ${n.title.replace(/[\r\n]/g, " ")}\n\n${parts.join("\n\n")}\n`,
          { flag: "wx", mode: 0o600 },
        );
        files.push(file);
      }
      if (originals.size) await mkdir(join(path, "assets"));
      for (const a of snapshot.assets.filter(
        (a, i, all) => all.findIndex((x) => x.sha256 === a.sha256) === i,
      ))
        await writeFile(join(path, "assets", a.sha256), originals.get(a.id)!, {
          flag: "wx",
          mode: 0o600,
        });
    }
    return { path, files, warnings: [...warnings] };
  } catch (e) {
    await rm(path, { recursive: true, force: true });
    throw e;
  }
}
