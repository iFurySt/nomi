import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

import { SyncClient } from "../../packages/host/src/sync-client";
import {
  documentFromSync,
  documentToSync,
  syncMutations,
  SYNC_PROTOCOL,
} from "../../packages/core/src/sync/protocol";
import { emptyCanvasScene } from "../../packages/core/src/canvas/embedded-canvas";

const env = process.env,
  output = env.NOMI_SYNC_TEST_OUTPUT!,
  url = env.NOMI_SYNC_TEST_URL!;
const login = await new SyncClient(url).login(
  "test@example.invalid",
  env.NOMI_SYNC_TEST_PASSWORD!,
  "device.mac",
  "Mac",
);
const api = new SyncClient(url, login.token),
  space = await api.createSpace("Mobile round trip");
const doc = emptyCanvasScene("document.home");
doc.notes = [
  { id: "note.mac", title: "From Mac", blocks: ["text.mac", "canvas.sketch"] },
];
doc.blocks = [
  { id: "text.mac", type: "markdown", source: "Written on Mac" },
  {
    id: "canvas.sketch",
    type: "canvas",
    scene: emptyCanvasScene("scene.sketch"),
  },
];
const pdf = Buffer.from("%PDF-1.4 synthetic mobile sync fixture\n%%EOF\n");
const digest = createHash("sha256").update(pdf).digest("hex");
doc.assets.push({
  id: "asset.pdf",
  name: "reference.pdf",
  mime: "application/pdf",
  bytes: pdf.length,
  sha256: digest,
});
doc.blocks.push({ id: "file.ref", type: "file", asset: "asset.pdf" });
doc.notes[0].blocks.push("file.ref");
await api.upload(space.id, digest, pdf);
const send = async (
  document: typeof doc,
  base: Awaited<ReturnType<typeof api.snapshot>>["records"],
) =>
  api.commit(space.id, {
    protocol: SYNC_PROTOCOL,
    requestId: "request." + randomUUID(),
    mutations: syncMutations(documentToSync(document), base),
  });
await send(doc, []);
const device =
  env.NOMI_IOS_DEVICE ??
  Object.values(
    JSON.parse(
      execFileSync("xcrun", ["simctl", "list", "devices", "booted", "-j"], {
        encoding: "utf8",
      }),
    ).devices as Record<string, { name: string; udid: string }[]>,
  )
    .flat()
    .find((d) => d.name === "iPhone Duo")?.udid;
assert(device, "Boot iPhone Duo or set NOMI_IOS_DEVICE");
execFileSync("xcodegen", ["generate"], { cwd: "apps/ios" });
// Load the same sandboxed Electron renderer, preload and host used by the desktop sync smoke.
const { launchSyncDesktop } = await import(
  resolve("scripts/fixtures/sync-test-desktop.mjs")
);
const mac = await launchSyncDesktop(output, "mac-duo-peer");
try {
  await mac.request("configure", { server: url });
  await mac.request("login", {
    server: url + "/api",
    email: "test@example.invalid",
    password: env.NOMI_SYNC_TEST_PASSWORD,
  });
  await mac.request("bind", { mode: "download", space: space.id });
  const run = spawn(
    "xcodebuild",
    [
      "-quiet",
      "-project",
      "apps/ios/NomiMobile.xcodeproj",
      "-scheme",
      "NomiMobile",
      "-destination",
      "platform=iOS Simulator,id=" + device,
      "-derivedDataPath",
      ".artifacts/mobile-docs/build",
      "-parallel-testing-enabled",
      "NO",
      "-only-testing:NomiMobileTests/CloudRoundTripTests",
      "-only-testing:NomiMobileUITests/ManuscriptTests",
      "-resultBundlePath",
      join(output, "mobile.xcresult"),
      "test",
    ],
    {
      stdio: "inherit",
      env: {
        ...env,
        TEST_RUNNER_NOMI_SYNC_TEST_URL: url,
        TEST_RUNNER_NOMI_SYNC_TEST_PASSWORD: env.NOMI_SYNC_TEST_PASSWORD!,
        TEST_RUNNER_NOMI_UI_LIBRARY: randomUUID(),
      },
    },
  );
  const done = new Promise<number | null>((resolve) =>
    run.once("exit", resolve),
  );
  async function waitFor(predicate: (candidate: typeof doc) => boolean) {
    for (let i = 0; i < 360; i++) {
      const snap = await api.snapshot(space.id),
        document = documentFromSync(snap.records, 1)!;
      if (predicate(document)) return { snap, document };
      if (run.exitCode !== null)
        throw Error("Simulator test exited before desktop received changes");
      await new Promise((r) => setTimeout(r, 500));
    }
    throw Error("Timed out waiting for simulator");
  }
  try {
    const { document } = await waitFor((d) =>
      d.notes.some((n) => n.title === "From Duo"),
    );
    assert.deepEqual(
      document.blocks.find((b) => b.id === "canvas.sketch"),
      doc.blocks[1],
    );
    assert.equal(
      (document.blocks.find((b) => b.id === "text.mac") as { source: string })
        .source,
      "Edited on Duo",
    );
    await mac.request("sync");
    const reopened: typeof doc = await mac.ui("snapshot");
    const note = reopened.notes.find((n) => n.title === "From Duo")!;
    assert.equal(note.parentId, "note.mac");
    const block = reopened.blocks.find((b) => b.id === note.blocks[0]);
    assert(block?.type === "markdown" && block.source === "Created on Duo");
    await mac.ui("edit", { block: block.id, text: "Edited on Mac" });
    await mac.request("sync");
    await waitFor((d) =>
      d.notes.some((n) => n.title === "Duo received Mac edit"),
    );
    await mac.request("sync");
    await mac.ui("edit", { block: block.id, text: "Concurrent Mac edit" });
    await mac.request("sync");
    assert.equal(await done, 0, "Simulator sync tests failed");
    const final = documentFromSync((await api.snapshot(space.id)).records, 1)!;
    assert.deepEqual(
      final.notes.map((n) => n.id),
      ["note.mac"],
    );
    assert.deepEqual(
      final.blocks.find((b) => b.type === "canvas"),
      doc.blocks[1],
    );
    assert.deepEqual(final.assets, doc.assets);
    assert.deepEqual(
      final.blocks.find((b) => b.id === "file.ref"),
      doc.blocks[2],
    );
    assert.deepEqual(await api.download(space.id, digest, pdf.length), pdf);
    await mac.request("sync");
    assert.deepEqual(
      (await mac.ui("snapshot")).notes.map((n: { id: string }) => n.id),
      ["note.mac"],
    );
    console.log(
      "PASS: iPhone Duo ↔ isolated Electron desktop, durable pending edits, nested canvas and attachment, stale writes, deletion and logout",
    );
  } finally {
    if (run.exitCode === null) run.kill("SIGTERM");
  }
} finally {
  await mac.stop();
}
