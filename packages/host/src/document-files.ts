import { constants } from "node:fs";
import { open, rename, rm, lstat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export async function regularFile(path: string, maxBytes: number) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes)
      throw Error("文稿目录中的文件无效或过大。");
    return await file.readFile();
  } finally {
    await file.close();
  }
}
export async function atomicFile(path: string, bytes: string | Uint8Array) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function directory(path: string) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("文稿目录不可用，或包含符号链接。");
}
