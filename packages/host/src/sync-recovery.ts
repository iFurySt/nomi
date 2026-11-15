import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** Only resolved conflict copies are pruned; active state/outbox and library backups are untouched. */
export async function pruneSyncRecovery(folder: string, now = Date.now()) {
  const files = [];
  for (const name of await readdir(folder)) {
    if (!/^resolved-[0-9a-f-]+\.json$/.test(name)) continue;
    const path = join(folder, name),
      info = await lstat(path);
    if (info.isFile()) files.push({ path, time: info.mtimeMs });
  }
  files.sort((a, b) => b.time - a.time || a.path.localeCompare(b.path));
  for (const file of files.slice(50))
    if (file.time < now - 30 * 24 * 60 * 60 * 1000) await rm(file.path);
}
