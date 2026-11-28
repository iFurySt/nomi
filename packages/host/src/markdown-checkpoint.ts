// The full workspace snapshot is a checkpoint. Until the next structural transaction,
// each edited block has one latest value and the small head records the committed revision.
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  LIBRARY_DOCUMENT_BYTES,
  MarkdownEdits,
  type CanvasDocument,
} from "../../core/src/canvas/index";
import type { DocumentMarkdownSave } from "../../core/src/document-storage";

import { packageFile, packageHash, type PackageManifest } from "./nomi-package";
import { commitTextFiles } from "./package-transaction";

const limit = 2 * 1024 * 1024;
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";
const conflict = () => Error("文稿已被外部修改，请重新读取。");
const overlay = (key: string) => "workspaces/" + key + ".markdown";
const deltaName = (id: string) => packageHash(Buffer.from(id)) + ".json";
async function optionalFile(root: string, path: string, max: number) {
  try {
    return await packageFile(root, path, max);
  } catch (e) {
    if (!missing(e)) throw e;
  }
}
async function fileStamp(path: string) {
  const s = await lstat(path, { bigint: true });
  if (!s.isFile()) throw conflict();
  return [s.ino, s.size, s.mtimeNs, s.ctimeNs].join("-");
}
export async function readMarkdownCheckpoint(
  root: string,
  key: string,
  doc: CanvasDocument,
  rebuilding = false,
) {
  const folder = overlay(key);
  const bytes = await optionalFile(root, folder + "/head", 256);
  if (!bytes) return doc;
  const head = JSON.parse(bytes.toString());
  if (
    (!rebuilding && head.base !== doc.revision) ||
    !Number.isSafeInteger(head.base) ||
    head.base < 1 ||
    !Number.isSafeInteger(head.revision) ||
    head.revision <= head.base
  )
    throw Error("正文增量版本无效。");
  if (rebuilding) return { ...doc, revision: head.base };
  const files = (await readdir(join(root, folder))).filter((f) =>
    /^[a-f0-9]{64}\.json$/.test(f),
  );
  if (files.length !== head.count || files.length > doc.blocks.length)
    throw Error("正文增量文件缺失。");
  const blocks = new Map(doc.blocks.map((b) => [b.id, b]));
  let total = 0;
  for (const name of files) {
    const bytes = await packageFile(root, folder + "/" + name, limit);
    total += bytes.length;
    if (total > LIBRARY_DOCUMENT_BYTES) throw Error("正文增量超过资料库预算。");
    const { id, source } = JSON.parse(bytes.toString());
    const block = blocks.get(id);
    if (
      block?.type !== "markdown" ||
      deltaName(id) !== name ||
      typeof source !== "string" ||
      source.length > 200000
    )
      throw Error("正文增量内容无效。");
    block.source = source;
  }
  doc.revision = head.revision;
  return doc;
}

type PackageSources = {
  path: string;
  files: Map<string, Buffer>;
  manifest?: PackageManifest;
};
interface Source {
  path: string;
  manifest: string;
  hash: string;
}
export class MarkdownCheckpoint {
  private sources = new Map<string, Source[]>();
  private manifests = new Map<string, { hash: string; stamp?: string }>();
  private edits: MarkdownEdits;
  private normalize = new Set<string>();
  private head?: Buffer;
  private constructor(
    readonly root: string,
    readonly key: string,
    document: CanvasDocument,
    private snapshotStamp: string,
    packages: Iterable<PackageSources>,
  ) {
    this.edits = new MarkdownEdits(structuredClone(document));
    for (const pkg of packages) {
      const bytes = pkg.files.get("document.json")!;
      const manifest =
        pkg.manifest ?? (JSON.parse(bytes.toString()) as PackageManifest);
      const path = pkg.path + "/document.json";
      this.manifests.set(path, { hash: packageHash(bytes) });
      const occupied = new Set(
        ["document.json", ...Object.values(manifest.assetPaths)].map((p) =>
          p.normalize().toLowerCase(),
        ),
      );
      const shared = new Set<string>();
      const collect = (doc: CanvasDocument) => {
        for (const block of doc.blocks) {
          if (block.type === "canvas" && block.scene) collect(block.scene);
          else if (block.type === "markdown" || block.type === "interactive") {
            const path = (block as { source: string }).source
              .normalize()
              .toLowerCase();
            if (occupied.has(path)) shared.add(path);
            occupied.add(path);
          }
        }
      };
      collect(manifest.document);
      for (const b of manifest.document.blocks) {
        if (b.type !== "markdown") continue;
        if (shared.has(b.source.normalize().toLowerCase()))
          this.normalize.add(b.id);
        const items = this.sources.get(b.id) ?? [];
        items.push({
          path: pkg.path + "/" + b.source,
          manifest: path,
          hash: packageHash(pkg.files.get(b.source)!),
        });
        this.sources.set(b.id, items);
      }
    }
  }
  static async create(
    root: string,
    key: string,
    document: CanvasDocument,
    packages: Iterable<PackageSources>,
  ) {
    const index = new MarkdownCheckpoint(
      root,
      key,
      document,
      await fileStamp(join(root, "workspaces", key)),
      packages,
    );
    index.head = await optionalFile(root, overlay(key) + "/head", 256);
    if (
      index.head &&
      JSON.parse(index.head.toString()).revision !== document.revision
    )
      throw conflict();
    return index;
  }
  private async checkManifest(path: string) {
    const item = this.manifests.get(path)!;
    const stamp = await fileStamp(join(this.root, path));
    if (item.stamp === stamp) return;
    if (
      packageHash(await packageFile(this.root, path, 32 * 1024 * 1024)) !==
      item.hash
    )
      throw conflict();
    item.stamp = stamp;
  }
  normalizedDocument(input: DocumentMarkdownSave) {
    if (
      !Array.isArray(input.changes) ||
      !input.changes.some((c) => this.normalize.has(c.id))
    )
      return;
    if (this.edits.document.revision !== input.baseRevision) throw conflict();
    return this.edits.apply(input.revision, input.changes);
  }
  async save(input: DocumentMarkdownSave) {
    const { root, key } = this,
      document = this.edits.document;
    if (
      document.revision !== input.baseRevision ||
      !Number.isSafeInteger(input.revision) ||
      input.revision <= document.revision
    )
      throw conflict();
    if (
      !Array.isArray(input.changes) ||
      !input.changes.length ||
      input.changes.length > document.blocks.length
    )
      throw Error("正文保存请求无效。");
    const folder = overlay(key),
      headPath = folder + "/head";
    const beforeHead = this.head;
    const head = beforeHead
      ? JSON.parse(beforeHead.toString())
      : { base: document.revision, count: 0 };
    if (beforeHead && head.revision !== document.revision) throw conflict();
    const checkHead = async () => {
      const currentHead = await optionalFile(root, headPath, 256);
      if (
        this.snapshotStamp !==
          (await fileStamp(join(root, "workspaces", key))) ||
        (beforeHead
          ? !currentHead?.equals(beforeHead)
          : currentHead !== undefined)
      )
        throw conflict();
    };
    const next = this.edits.apply(input.revision, input.changes);
    const files: Parameters<typeof commitTextFiles>[2] = [];
    const touched = new Set<string>(),
      seen = new Set<string>();
    const applied: { item: Source; hash: string }[] = [];

    for (const { id, source } of input.changes) {
      if (seen.has(id)) throw Error("重复的正文块。");
      seen.add(id);
      const paths = this.sources.get(id);
      if (!paths?.length) throw conflict();
      const bytes = Buffer.from(source);
      if (bytes.toString() !== source)
        throw Error("正文包含无效的 Unicode 字符。");
      for (const item of paths) {
        touched.add(item.manifest);
        const before = await packageFile(root, item.path, limit);
        if (packageHash(before) !== item.hash) throw conflict();
        files.push({ path: item.path, before, bytes });
        applied.push({ item, hash: packageHash(bytes) });
      }
      const path = folder + "/" + deltaName(id);
      const before = await optionalFile(root, path, limit);
      if (!before) head.count++;
      files.push({
        path,
        before,
        bytes: Buffer.from(JSON.stringify({ id, source })),
      });
    }

    const nextHead = Buffer.from(
      JSON.stringify({ ...head, revision: input.revision }),
    );
    files.push({ path: headPath, before: beforeHead, bytes: nextHead });
    await commitTextFiles(root, key, files, async () => {
      await checkHead();
      for (const path of touched) await this.checkManifest(path);
      for (const file of files) {
        if (
          !file.path.startsWith(folder + "/") &&
          !(await packageFile(root, file.path, limit)).equals(file.before!)
        )
          throw conflict();
      }
    });
    for (const { item, hash } of applied) item.hash = hash;
    this.head = nextHead;
    return {
      document: next,
      written: files.map((f) => [f.path, packageHash(f.bytes)] as const),
    };
  }
}
