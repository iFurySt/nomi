import { expect, it } from "vitest";
import {
  mkdtemp,
  readdir,
  rm,
  writeFile,
  utimes,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneSyncRecovery } from "./sync-recovery";
it("keeps the union of fifty resolved copies and thirty days, leaving active state and links untouched", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nomi-sync-retention-"));
  const now = Date.now(),
    day = 86400000;
  try {
    for (let i = 0; i < 80; i++) {
      const path = join(dir, `resolved-${i.toString(16)}.json`);
      await writeFile(path, "{}");
      await utimes(
        path,
        new Date(now - (80 - i) * day),
        new Date(now - (80 - i) * day),
      );
    }
    await writeFile(join(dir, "state.json"), "active");
    await symlink("state.json", join(dir, "resolved-abc.json"));
    await pruneSyncRecovery(dir, now);
    expect((await readdir(dir)).length).toBe(52);
    for (let i = 80; i < 140; i++)
      await writeFile(join(dir, `resolved-${i.toString(16)}.json`), "{}");
    await pruneSyncRecovery(dir, now);
    expect((await readdir(dir)).length).toBe(92); // 30 old recent + 60 new + state/link
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
