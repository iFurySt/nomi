import { build } from "esbuild";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(join(root, ".artifacts/sync-package"), { recursive: true });
const output = await mkdtemp(join(root, ".artifacts/sync-package/run-"));
const container = `nomi-sync-package-${process.pid}`,
  password = randomUUID(),
  email = "test@example.invalid";
let service,
  started = false;
const run = (cmd, args, options = {}) =>
  (
    execFileSync(cmd, args, {
      cwd: root,
      stdio: "pipe",
      ...options,
    })?.toString() ?? ""
  ).trim();
try {
  run("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    container,
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_USER=nomi_test",
    "-e",
    "POSTGRES_PASSWORD=nomi_test_local",
    "-e",
    "POSTGRES_DB=nomi_sync_test",
    "postgres:18",
  ]);
  started = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      run("docker", [
        "exec",
        container,
        "pg_isready",
        "-U",
        "nomi_test",
        "-d",
        "nomi_sync_test",
      ]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!ready) throw Error("PostgreSQL readiness timeout");
  const pgPort = run("docker", ["port", container, "5432/tcp"])
    .split(":")
    .at(-1);
  const env = {
    ...process.env,
    NOMI_SYNC_DATABASE_URL: `postgres://nomi_test:nomi_test_local@127.0.0.1:${pgPort}/nomi_sync_test?sslmode=disable`,
    NOMI_SYNC_OBJECT_DIR: join(output, "objects"),
  };
  const binary = join(output, "nomi-sync");
  run("go", ["build", "-o", binary, "./cmd/nomi-sync"], {
    cwd: join(root, "apps/sync-server"),
  });
  run(binary, ["migrate"], { env });
  run(binary, ["create-user", "--email", email, "--password-stdin"], {
    env,
    input: password,
  });
  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const url = `http://127.0.0.1:${port}`;
  service = spawn(binary, ["serve", "--addr", `127.0.0.1:${port}`], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stderr.on("data", (b) => process.stderr.write(b));
  ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (service.exitCode !== null) throw Error("Sync server exited early");
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("Sync server readiness timeout");
  const desktop = process.argv.includes("--desktop");
  const fixture = desktop
    ? join(root, "scripts/check-sync-desktop.mjs")
    : join(output, "fixture.mjs");
  if (!desktop)
    await build({
      entryPoints: [join(root, "scripts/fixtures/sync-package.ts")],
      outfile: fixture,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      banner: {
        js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);",
      },
    });
  run(process.execPath, [fixture], {
    env: {
      ...process.env,
      NOMI_SYNC_TEST_OUTPUT: output,
      NOMI_SYNC_TEST_URL: url,
      NOMI_SYNC_TEST_PASSWORD: password,
    },
    stdio: "inherit",
  });
  if (process.argv.includes("--backup")) {
    const backup = join(output, "backup");
    const backupEnv = {
      ...env,
      NOMI_SYNC_BINARY: binary,
      NOMI_SYNC_PG_CONTAINER: container,
      NOMI_SYNC_DB_USER: "nomi_test",
      NOMI_SYNC_DB_NAME: "nomi_sync_test",
    };
    run("bash", ["scripts/backup-sync-server.sh", backup], {
      env: backupEnv,
      stdio: "inherit",
    });
    run("docker", [
      "exec",
      container,
      "createdb",
      "-U",
      "nomi_test",
      "nomi_sync_restore",
    ]);
    const restoreEnv = {
      ...backupEnv,
      NOMI_SYNC_DB_NAME: "nomi_sync_restore",
      NOMI_SYNC_DATABASE_URL: env.NOMI_SYNC_DATABASE_URL.replace(
        "/nomi_sync_test?",
        "/nomi_sync_restore?",
      ),
      NOMI_SYNC_OBJECT_DIR: join(output, "restored-objects"),
    };
    run("bash", ["scripts/restore-sync-server.sh", backup], {
      env: restoreEnv,
      stdio: "inherit",
    });
    for (const table of [
      "sync_users",
      "sync_sessions",
      "sync_browser_logins",
      "sync_spaces",
      "sync_entities",
      "sync_history",
      "sync_changes",
      "sync_receipts",
      "sync_objects",
      "sync_asset_identities",
    ]) {
      const sql = `SELECT md5(string_agg(row_to_json(t)::text, ',' ORDER BY row_to_json(t)::text)) FROM ${table} t`;
      const checksum = (db) =>
        run("docker", [
          "exec",
          container,
          "psql",
          "-U",
          "nomi_test",
          "-d",
          db,
          "-At",
          "-c",
          sql,
        ]);
      assert.equal(
        checksum("nomi_sync_restore"),
        checksum("nomi_sync_test"),
        table,
      );
    }
    assert.throws(
      () =>
        run("bash", ["scripts/restore-sync-server.sh", backup], {
          env: restoreEnv,
        }),
      /failed/i,
    );
    const archive = join(backup, "objects.tar.gz"),
      bytes = await readFile(archive);
    bytes[10] ^= 255;
    await writeFile(archive, bytes);
    assert.throws(
      () =>
        run("bash", ["scripts/restore-sync-server.sh", backup], {
          env: restoreEnv,
        }),
      /failed/i,
    );
    await writeFile(
      join(output, "backup-report.json"),
      JSON.stringify(
        {
          databaseTables: 9,
          hashesVerified: true,
          existingTargetRefused: true,
          corruptArchiveRefused: true,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: paired PostgreSQL/original backup restored into a new database and empty disk directory",
    );
  }
  console.log(
    `Report: ${join(output, desktop ? "desktop-report.json" : "report.json")}`,
  );
} finally {
  if (service && service.exitCode === null) {
    const done = new Promise((r) => service.once("exit", r));
    service.kill("SIGTERM");
    await done;
  }
  if (started) run("docker", ["rm", "-f", container]);
}
