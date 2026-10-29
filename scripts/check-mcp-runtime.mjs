import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = join(root, ".artifacts/codex");
await mkdir(artifacts, { recursive: true });
const dir = await mkdtemp(join(artifacts, "smoke-"));
const entry = join(dir, "main.mjs");
try {
  await build({
    absWorkingDir: root,
    entryPoints: ["scripts/fixtures/mcp-runtime.ts"],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "warning",
  });
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    stdio: "inherit",
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 30000);
  const code = await new Promise((resolve) =>
    child.once("exit", (code) => resolve(code ?? 1)),
  );
  clearTimeout(timeout);
  if (code !== 0) throw Error("Codex MCP integration smoke failed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
