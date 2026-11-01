import { mkdir, lstat, rename, rm } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicFile, directory, regularFile } from "./document-files";
import {
  packageFile,
  packageHash,
  planPackages,
  type PackageTree,
} from "./nomi-package";
import type { CanvasDocument } from "../../core/src/canvas/index";

type Operation =
  | { type: "move"; from: string; to: string }
  | {
      type: "write";
      path: string;
      source: string;
      before: string | null;
      after: string;
    }
  | { type: "mkdir"; path: string };
interface Journal {
  version: 1;
  token: string;
  cursor: number;
  operations: Operation[];
}
const exists = async (path: string) => {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
};
async function safeParents(root: string, path: string) {
  const pieces = path.split("/");
  if (
    path.startsWith("/") ||
    pieces.some((s) => !s || s === "." || s === "..") ||
    path.includes("\\") ||
    path.includes("\0")
  )
    throw Error("恢复事务路径无效。");
  await directory(root);
  for (let i = 1; i < pieces.length; i++)
    await directory(join(root, ...pieces.slice(0, i)));
}
async function safeMkdir(root: string, path: string) {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join("/");
    await safeParents(root, p);
    if (!(await exists(join(root, p)))) await mkdir(join(root, p));
    await directory(join(root, p));
  }
}
export async function recoverPackages(root: string, key: string) {
  const pointer = join(root, "workspaces", key + ".package-journal");
  if (!(await exists(pointer))) return;
  const j = JSON.parse(
    (await regularFile(pointer, 8 * 1024 * 1024)).toString(),
  ) as Journal;
  if (
    j.version !== 1 ||
    !/^[-a-f0-9]{36}$/.test(j.token) ||
    !Array.isArray(j.operations) ||
    !Number.isInteger(j.cursor) ||
    j.cursor < 0 ||
    j.cursor > j.operations.length
  )
    throw Error("文稿包恢复日志无效。");
  for (; j.cursor < j.operations.length; j.cursor++) {
    const op = j.operations[j.cursor];
    if (op.type === "mkdir") await safeMkdir(root, op.path);
    else if (op.type === "move") {
      await safeParents(root, op.from);
      await safeParents(root, op.to);
      if (await exists(join(root, op.from))) {
        if (await exists(join(root, op.to)))
          throw Error("恢复目标已被外部修改，原资料已保留。");
        await directory(join(root, op.from));
        await rename(join(root, op.from), join(root, op.to));
      } else if (!(await exists(join(root, op.to))))
        throw Error("文稿包恢复目录缺失。");
    } else if (op.type === "write") {
      await safeParents(root, op.path);
      const now = (await exists(join(root, op.path)))
        ? await packageFile(root, op.path, 32 * 1024 * 1024)
        : undefined;
      const hash = now ? packageHash(now) : null;
      if (hash !== op.after) {
        if (hash !== op.before)
          throw Error("文件在提交期间被外部修改，已停止并保留恢复资料。");
        if (!op.source.startsWith(`.nomi-history/${j.token}/staged/`))
          throw Error("恢复原件路径无效。");
        const bytes = await packageFile(root, op.source, 32 * 1024 * 1024);
        if (packageHash(bytes) !== op.after) throw Error("恢复原件损坏。");
        await atomicFile(join(root, op.path), bytes);
      }
    } else throw Error("未知恢复操作。");
    await atomicFile(pointer, JSON.stringify({ ...j, cursor: j.cursor + 1 }));
  }
  await rm(pointer);
}
/** Journal only changed files. Directory renames preserve package inode and all unowned files. */
export async function commitPackages(
  root: string,
  folder: string,
  key: string,
  snapshot: unknown,
  document: CanvasDocument,
  previous: PackageTree | undefined,
  originals: Map<string, Buffer>,
  check: () => Promise<void>,
) {
  const token = randomUUID(),
    base = `.nomi-history/${token}`,
    ops: Operation[] = [];
  await safeMkdir(root, base + "/staged");
  await safeMkdir(root, base + "/hold");
  const plan = planPackages(document, previous, originals);
  let serial = 0;
  const write = async (
    path: string,
    bytes: Buffer,
    before: Buffer | undefined,
  ) => {
    if (before?.equals(bytes)) return;
    const source = `${base}/staged/${serial++}`;
    await atomicFile(join(root, source), bytes);
    if (before) await atomicFile(join(root, base, `before-${serial}`), before);
    ops.push(
      { type: "mkdir", path: dirname(path).replaceAll("\\", "/") },
      {
        type: "write",
        path,
        source,
        before: before ? packageHash(before) : null,
        after: packageHash(bytes),
      },
    );
  };
  const cachePath = "workspaces/" + key;
  let beforeCache: Buffer | undefined;
  try {
    beforeCache = await regularFile(join(root, cachePath), 32 * 1024 * 1024);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (beforeCache)
    await atomicFile(join(root, base, "before.json"), beforeCache);
  const old = new Map(previous?.entries.map((e) => [e.manifest.packageId, e]));
  const structural =
    !previous ||
    old.size !== plan.size ||
    [...plan].some(
      ([id, p]) =>
        relative(join(root, folder), old.get(id)?.path ?? "") !== p.path,
    );
  if (!previous) {
    if (await exists(join(root, folder)))
      ops.push({ type: "move", from: folder, to: base + "/legacy-tree" });
    ops.push({ type: "mkdir", path: folder });
  } else if (structural) {
    for (const e of [...previous.entries].sort(
      (a, b) => b.path.length - a.path.length,
    ))
      ops.push({
        type: "move",
        from: relative(root, e.path),
        to: base + "/hold/" + e.manifest.packageId,
      });
  }
  for (const [id, p] of [...plan].sort(
    (a, b) => a[1].path.length - b[1].path.length,
  )) {
    const target = folder + "/" + p.path;
    if (structural) {
      ops.push({ type: "mkdir", path: dirname(target) });
      if (old.has(id))
        ops.push({ type: "move", from: base + "/hold/" + id, to: target });
      else ops.push({ type: "mkdir", path: target });
    }
    for (const [name, bytes] of p.files)
      await write(target + "/" + name, bytes, old.get(id)?.files.get(name));
  }
  await write(
    cachePath,
    Buffer.from(JSON.stringify(snapshot, null, 2) + "\n"),
    beforeCache,
  );
  await check();
  const journal: Journal = { version: 1, token, cursor: 0, operations: ops };
  await atomicFile(
    join(root, "workspaces", key + ".package-journal"),
    JSON.stringify(journal),
  );
  await recoverPackages(root, key);
}
