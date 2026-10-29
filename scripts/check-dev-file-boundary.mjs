import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadConfigFromFile } from "vite";

// Use the actual Vite deny policy with synthetic files and no data-service plugin.
// Never read the repository's real signing material or local workspace.
const configPath = fileURLToPath(
  new URL("../apps/web/vite.config.ts", import.meta.url),
);
const loaded = await loadConfigFromFile(
  { command: "serve", mode: "test" },
  configPath,
);
assert(loaded, "Vite config could not be loaded");
const root = await mkdtemp(join(tmpdir(), "nomi-dev-boundary-"));
let server;
try {
  const blocked = [
    ".apple/signing-test.txt",
    ".harness/secret-test.txt",
    ".nomi/workspace-test.txt",
    "chatgpt/profiles.enc",
    "nomi-vault.key",
    "records.sqlite",
    "signing.p8",
    ".env",
  ];
  for (const name of ["public-test.txt", ...blocked]) {
    const path = join(root, name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "synthetic-boundary-test");
  }
  server = await createServer({
    ...loaded.config,
    configFile: false,
    root,
    plugins: [],
    logLevel: "silent",
    server: {
      ...loaded.config.server,
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      fs: { ...loaded.config.server.fs, allow: [root] },
    },
  });
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}/@fs${root}/`;
  const control = await fetch(base + "public-test.txt");
  assert.equal(control.status, 200, "Control file must be reachable");
  assert.equal(await control.text(), "synthetic-boundary-test");
  for (const name of blocked) {
    const response = await fetch(base + name);
    assert.equal(response.status, 403, `${name} must be denied`);
    assert(!(await response.text()).includes("synthetic-boundary-test"));
  }
  console.log(
    JSON.stringify({
      publicFileReachable: true,
      privatePathsDenied: blocked.length,
    }),
  );
} finally {
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
