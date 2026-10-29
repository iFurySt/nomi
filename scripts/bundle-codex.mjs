import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  writeFileSync,
  cpSync,
  renameSync,
  existsSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = dirname(require.resolve("@openai/codex/package.json"));
const version = require("@openai/codex/package.json").version;
if (version !== "0.160.0")
  throw Error("Regenerate and verify the Codex protocol before upgrading.");
const target = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
}[`${process.platform}-${process.arch}`];
if (!target) throw Error("Unsupported Codex runtime target");
const platformRequire = createRequire(join(pkg, "package.json"));
const platform = dirname(
  platformRequire.resolve(
    `@openai/codex-${process.platform}-${process.arch}/package.json`,
  ),
);
const vendor = join(platform, "vendor", target);
const output = join(root, "apps/desktop/dist/codex");
mkdirSync(dirname(output), { recursive: true });
// Never overwrite a signed Mach-O in place: macOS can retain the previous
// inode's code-signing cache and kill the copied executable with SIGKILL.
const staged = mkdtempSync(join(dirname(output), ".codex-stage-"));
try {
  cpSync(vendor, staged, { recursive: true, preserveTimestamps: true });
  for (const name of ["LICENSE", "NOTICE"])
    copyFileSync(join(root, "third_party/codex", name), join(staged, name));
  writeFileSync(
    join(staged, "runtime.json"),
    JSON.stringify({
      version,
      target,
      source: "https://github.com/openai/codex",
      license: "Apache-2.0",
    }) + "\n",
  );
  const binary = join(
    staged,
    "bin",
    process.platform === "win32" ? "codex.exe" : "codex",
  );
  if (
    !execFileSync(binary, ["--version"], { encoding: "utf8" }).includes(version)
  )
    throw Error("Wrong Codex binary");
  const previous = `${staged}-previous`;
  if (existsSync(output)) renameSync(output, previous);
  try {
    renameSync(staged, output);
  } catch (error) {
    if (existsSync(previous)) renameSync(previous, output);
    throw error;
  }
  rmSync(previous, { recursive: true, force: true });
} finally {
  rmSync(staged, { recursive: true, force: true });
}
