// Explicit synthetic-only remote verification; never reads existing local document libraries.
import { readFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const [file, destination] = process.argv.slice(2);
assert(
  file && destination,
  "Usage: node scripts/check-sync-remote.mjs PRIVATE_SYNTHETIC_ACCOUNT_JSON OUTPUT_DIRECTORY",
);
const account = JSON.parse(await readFile(file, "utf8"));
assert(
  account.email.endsWith("@example.invalid"),
  "Only a dedicated synthetic account may be used",
);
assert(
  new URL(account.server).protocol === "https:",
  "Remote check requires HTTPS",
);
const output = resolve(destination);
await mkdir(output, { recursive: true, mode: 0o700 });
const fixture = join(output, "fixture.mjs");
await build({
  entryPoints: ["scripts/fixtures/sync-package.ts"],
  outfile: fixture,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
  },
});
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [fixture], {
    stdio: "inherit",
    env: {
      ...process.env,
      NOMI_SYNC_TEST_OUTPUT: output,
      NOMI_SYNC_TEST_URL: account.server,
      NOMI_SYNC_TEST_EMAIL: account.email,
      NOMI_SYNC_TEST_PASSWORD: account.password,
      NOMI_SYNC_TEST_REVOKE: "1",
    },
  });
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(
          Error(
            `Remote verification failed (${code}); review and revoke synthetic sessions`,
          ),
        ),
  );
});
