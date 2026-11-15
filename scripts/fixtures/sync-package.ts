import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { DocumentStore } from "../../packages/host/src/document-store";
import { SyncClient, SyncAPIError } from "../../packages/host/src/sync-client";
import {
  createCanvasDocument,
  emptyCanvasScene,
} from "../../packages/core/src/canvas/index";
import {
  documentToSync,
  documentFromSync,
  syncMutations,
  SYNC_PROTOCOL,
  type SyncRecord,
} from "../../packages/core/src/sync/protocol";

const root = process.env.NOMI_SYNC_TEST_OUTPUT!,
  url = process.env.NOMI_SYNC_TEST_URL!,
  password = process.env.NOMI_SYNC_TEST_PASSWORD!;
assert(root && url && password);
const a = new DocumentStore(
  join(root, "mac-a/config.json"),
  join(root, "mac-a/library"),
);
const b = new DocumentStore(
  join(root, "mac-b/config.json"),
  join(root, "mac-b/library"),
);
const unauth = new SyncClient(url);
const loginA = await unauth.login(
  process.env.NOMI_SYNC_TEST_EMAIL ?? "test@example.invalid",
  password,
  "device.mac-a",
  "Mac A isolated",
);
const loginB = await unauth.login(
  process.env.NOMI_SYNC_TEST_EMAIL ?? "test@example.invalid",
  password,
  "device.mac-b",
  "Mac B isolated",
);
assert.notEqual(loginA.token, loginB.token);
const ca = new SyncClient(url, loginA.token),
  cb = new SyncClient(url, loginB.token);
const space = await ca.createSpace("Package round trip");
const doc = createCanvasDocument();
doc.notes[0].title = "同步原件";
doc.notes[1].parentId = doc.notes[0].id;
const pdf = Buffer.from("%PDF-1.4 synthetic original\n%%EOF\n");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);
const originals = [
  {
    bytes: pdf,
    asset: {
      id: "asset.pdf",
      name: "fixture.pdf",
      mime: "application/pdf",
      bytes: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
    },
  },
  {
    bytes: png,
    asset: {
      id: "asset.png",
      name: "fixture.png",
      mime: "image/png",
      bytes: png.length,
      sha256: createHash("sha256").update(png).digest("hex"),
    },
  },
];
doc.assets = originals.map((x) => x.asset);
doc.blocks.push(
  { id: "file.pdf", type: "file", asset: "asset.pdf" },
  { id: "image.png", type: "image", asset: "asset.png" },
);
const scene = emptyCanvasScene("scene.fixture");
scene.blocks = [
  { id: "text.nested", type: "markdown", source: "公式 \\(Q\\) 与 **中文**" },
];
scene.board.placements = [
  { id: "place.nested", content: "text.nested", x: 10, y: 20, width: 300 },
];
doc.blocks.push({ id: "canvas.fixture", type: "canvas", scene });
doc.notes[0].blocks.push("file.pdf", "image.png", "canvas.fixture");
doc.notes[1].blocks.push(doc.notes[0].blocks[0]); // Shared block must not become a second owner.
Object.assign(doc, { extension: { fixture: true } });
await a.save({
  profile: "local-device",
  documentId: doc.id,
  document: doc,
  assets: originals,
  baseRevision: null,
});
const localA = (await a.load("local-device", doc.id))!;
const initial = syncMutations(documentToSync(localA), []);
await assert.rejects(
  ca.commit(space.id, {
    protocol: SYNC_PROTOCOL,
    requestId: "request.before-assets",
    mutations: initial,
  }),
  /Upload attachment/,
);
for (const x of originals) await ca.upload(space.id, x.asset.sha256, x.bytes);
await ca.commit(space.id, {
  protocol: SYNC_PROTOCOL,
  requestId: "request.initial",
  mutations: initial,
});
const snapshot = await cb.snapshot(space.id),
  remote = documentFromSync(snapshot.records, 1)!;
const downloaded = await Promise.all(
  remote.assets.map(async (asset) => ({
    asset,
    bytes: await cb.download(space.id, asset.sha256, asset.bytes),
  })),
);
await b.save({
  profile: "local-device",
  documentId: remote.id,
  document: remote,
  assets: downloaded,
  baseRevision: null,
});
const reopened = new DocumentStore(
  join(root, "mac-b/config.json"),
  join(root, "mac-b/library"),
);
assert.deepEqual(
  documentToSync((await reopened.load("local-device", remote.id))!),
  documentToSync(localA),
);
for (const x of originals) {
  const saved = await reopened.asset("local-device", remote.id, x.asset.id);
  assert(saved);
  assert.deepEqual(Buffer.from(saved.bytes), x.bytes);
}
const packages = await readdir(join(root, "mac-b/library/文稿"));
assert(packages.some((p) => p.endsWith(".nomi")));
// Continue from B, preserving all unrelated content and originals.
const next = (await reopened.load("local-device", remote.id))!;
const text = next.blocks.find((x) => x.type === "markdown")!;
assert(text.type === "markdown");
text.source += "\n\nMac B 的追加内容";
next.revision++;
assert.equal(
  (await reopened.load("local-device", remote.id))!.revision,
  next.revision - 1,
);
await reopened.save({
  profile: "local-device",
  documentId: next.id,
  document: next,
  assets: [],
  baseRevision: next.revision - 1,
});
const edits = syncMutations(documentToSync(next), snapshot.records);
assert.equal(edits.length, 1);
await cb.commit(space.id, {
  protocol: SYNC_PROTOCOL,
  requestId: `request.${randomUUID()}`,
  mutations: edits,
});
const changes = await ca.changes(space.id, snapshot.cursor);
const records = new Map(snapshot.records.map((r) => [`${r.kind}:${r.id}`, r]));
for (const batch of changes.changes)
  for (const r of batch.records) records.set(`${r.kind}:${r.id}`, r);
const merged = documentFromSync(
  [...records.values()] as SyncRecord[],
  localA.revision + 1,
)!;
assert.equal(
  (await a.load("local-device", merged.id))!.revision,
  localA.revision,
);
await a.save({
  profile: "local-device",
  documentId: merged.id,
  document: merged,
  assets: [],
  baseRevision: localA.revision,
});
assert.deepEqual(
  documentToSync((await a.load("local-device", merged.id))!),
  documentToSync(next),
);
// A repeated acknowledgement is stable, and an old device cannot overwrite newer content.
const current = await ca.snapshot(space.id);
const target = current.records.find(
  (r) => r.kind === "block" && r.data?.type === "markdown",
)!;
const batch = {
  protocol: SYNC_PROTOCOL,
  requestId: `req.${randomUUID()}`,
  mutations: [
    {
      kind: target.kind,
      id: target.id,
      baseVersion: target.version,
      deleted: false,
      data: { ...target.data!, source: "Synthetic public conflict winner" },
    },
  ],
};
const receipt = await ca.commit(space.id, batch);
assert.deepEqual(await ca.commit(space.id, batch), receipt);
await assert.rejects(
  cb.commit(space.id, {
    ...batch,
    requestId: `req.${randomUUID()}`,
    mutations: [
      {
        ...batch.mutations[0],
        data: { ...target.data!, source: "stale writer" },
      },
    ],
  }),
  (e) => e instanceof SyncAPIError && e.status === 409,
);
assert.equal(
  (await cb.snapshot(space.id)).records.find(
    (r) => r.kind === target.kind && r.id === target.id,
  )?.data?.source,
  "Synthetic public conflict winner",
);
assert.equal(
  (
    await fetch(
      `${url}/v1/spaces/${space.id}/objects/${originals[0].asset.sha256}`,
    )
  ).status,
  401,
);
if (process.env.NOMI_SYNC_TEST_REVOKE === "1") {
  await ca.revoke(loginA.sessionId);
  await cb.revoke(loginB.sessionId);
  await assert.rejects(
    ca.me(),
    (e) => e instanceof SyncAPIError && e.status === 401,
  );
}
await mkdir(root, { recursive: true });
await writeFile(
  join(root, "report.json"),
  JSON.stringify(
    {
      passed: true,
      protocol: SYNC_PROTOCOL,
      clients: 2,
      distinctDirectories: true,
      distinctDeviceSessions: true,
      attachments: originals.length,
      initialEntities: initial.length,
      incrementalEntities: edits.length,
      packageRoundTrip: true,
      conflictPreservesWinner: true,
      idempotentRetry: true,
      unauthenticatedOriginalRejected: true,
      sharedBlocks: true,
      nestedCanvas: true,
    },
    null,
    2,
  ),
);
console.log(
  "PASS: two isolated document stores, real Go API, original attachments, shared blocks and nested canvas round trip",
);
