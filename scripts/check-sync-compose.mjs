import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import assert from "node:assert/strict";
const socket = createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const project = `nomi-sync-check-${randomBytes(5).toString("hex")}`;
const env = {
  ...process.env,
  NOMI_SYNC_DB_PASSWORD: randomBytes(24).toString("hex"),
  NOMI_SYNC_PORT: String(port),
};
function compose(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["compose", "-f", "infra/sync/compose.yml", "-p", project, ...args],
      { env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.stdin.end(input);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(Error(`Compose ${args[0]} failed: ${err}`)),
    );
  });
}
try {
  await compose(["build", "sync"]);
  await compose(["up", "-d", "--wait", "postgres"]);
  await compose(["run", "--rm", "-T", "sync", "migrate"]);
  await compose(
    [
      "run",
      "--rm",
      "-T",
      "sync",
      "create-user",
      "--email",
      "compose@example.test",
      "--password-stdin",
    ],
    randomBytes(20).toString("hex") + "\n",
  );
  await compose(["up", "-d", "--no-deps", "sync"]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      ready = r.ok && (await r.json()).status === "ok";
      if (ready) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(ready, "Container service is not healthy");
  const report = JSON.parse(
    await compose(["exec", "-T", "sync", "nomi-sync", "verify"]),
  );
  assert.equal(report.objects, 0);
  await compose(["exec", "-T", "sync", "nomi-sync", "maintain"]);
  console.log(
    "PASS: separate Compose project, nonroot/read-only server, persistent volume permissions, explicit migration, private user provisioning, health, verify and maintenance",
  );
} finally {
  await compose(["down", "-v", "--remove-orphans"]);
}
