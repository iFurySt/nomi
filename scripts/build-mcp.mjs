import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  metafile: true,
  absWorkingDir: root,
  entryPoints: ["apps/mcp/src/main.ts"],
  outfile: "apps/mcp/dist/main.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

// Preserve notices for every third-party package actually included by the bundler.
const notices = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes("node_modules/")) continue;
  let folder = dirname(resolve(root, input));
  let pkg;
  while (folder !== dirname(folder)) {
    if (existsSync(join(folder, "package.json"))) {
      const candidate = JSON.parse(
        readFileSync(join(folder, "package.json"), "utf8"),
      );
      if (candidate.name && candidate.version) {
        pkg = candidate;
        break;
      }
    }
    folder = dirname(folder);
  }
  if (!pkg) throw Error(`Cannot identify bundled dependency: ${input}`);
  const key = `${pkg.name}@${pkg.version}`;
  if (notices.has(key)) continue;
  const license = [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "license",
    "license.md",
    "COPYING",
  ].find((name) => existsSync(join(folder, name)));
  if (!license) throw Error(`Missing bundled license for ${key}`);
  notices.set(key, `${key}\n${readFileSync(join(folder, license), "utf8")}`);
}
writeFileSync(
  resolve(root, "apps/mcp/dist/LICENSES.txt"),
  [...notices.values()].join("\n\n"),
);
