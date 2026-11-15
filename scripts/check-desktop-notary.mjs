import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Read-only credential/service probe. Never print submission history or key material.
const key = process.env.DESKTOP_ASC_PRIVATE_KEY;
const keyId = process.env.ASC_KEY_ID;
const issuer = process.env.ASC_ISSUER_ID;
if (!key || !keyId || !issuer) throw Error("Notarization credentials missing.");
const folder = mkdtempSync(join(tmpdir(), "nomi-notary-check-"));
try {
  const path = join(folder, "notary.p8");
  writeFileSync(path, key, { mode: 0o600 });
  const result = spawnSync("xcrun", ["notarytool", "history", "--key", path,
    "--key-id", keyId, "--issuer", issuer, "--output-format", "json"],
  { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) {
    let detail = String(result.stderr || result.error?.message || "No diagnostic returned");
    for (const secret of [key, keyId, issuer, path]) detail = detail.split(secret).join("[redacted]");
    detail = detail.replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g, "[redacted key]")
      .replace(/https?:\/\/\S+/g, "[service URL]");
    throw Error(`Notarization probe failed (exit ${result.status}, signal ${result.signal}): ${detail.slice(0, 2000)}`);
  }
  JSON.parse(result.stdout);
  console.log("Apple notarization credentials and service: PASS");
} finally {
  rmSync(folder, { recursive: true, force: true });
}
