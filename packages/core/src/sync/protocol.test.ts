import { expect, it } from "vitest";
import { createCanvasDocument } from "../canvas/document";
import {
  documentToSync,
  documentFromSync,
  syncMutations,
  SYNC_PROTOCOL,
  type SyncRecord,
} from "./protocol";
const base = (doc = createCanvasDocument()): SyncRecord[] =>
  documentToSync(doc).map((r) => ({
    ...r,
    version: 1,
    deleted: false,
    updatedAt: new Date(0).toISOString(),
  }));
it("round trips native content and unknown fields, excluding only local revision", () => {
  const doc = createCanvasDocument();
  Object.assign(doc, { extension: { color: "blue" } });
  Object.assign(doc.notes[0], { futureMetadata: true });
  const records = base(doc),
    restored = documentFromSync(records, 42)!;
  expect(restored.revision).toBe(42);
  expect(documentToSync(restored)).toEqual(documentToSync(doc));
  expect(SYNC_PROTOCOL).toBe("nomi-sync/v1");
});
it("changing one Markdown block uploads only that block, never whole note or library", () => {
  const doc = createCanvasDocument(),
    before = base(doc);
  const text = doc.blocks.find((b) => b.type === "markdown")!;
  if (text.type !== "markdown") throw Error();
  text.source += "\n\nNew content";
  doc.revision += 100;
  const diff = syncMutations(documentToSync(doc), before);
  expect(diff).toHaveLength(1);
  expect(diff[0]).toMatchObject({ kind: "block", id: text.id, baseVersion: 1 });
});
it("maps ordering separately, preserves shared blocks and tombstone versions", () => {
  const doc = createCanvasDocument();
  doc.notes[1].blocks.push(doc.notes[0].blocks[0]);
  const records = base(doc);
  const restored = documentFromSync(records, 2)!;
  expect(restored.notes[1].blocks).toEqual(doc.notes[1].blocks);
  doc.notes[0].blocks.reverse();
  expect(
    syncMutations(documentToSync(doc), records).every(
      (r) => r.kind === "order",
    ),
  ).toBe(true);
  const tombstone = {
    kind: "block" as const,
    id: "text.deleted",
    version: 8,
    deleted: true,
    data: null,
    updatedAt: "",
  };
  const diff = syncMutations(
    [
      ...documentToSync(doc),
      {
        kind: "block",
        id: "text.deleted",
        data: { id: "text.deleted", type: "markdown", source: "restore" },
      },
    ],
    [...records, tombstone],
  );
  expect(diff.find((r) => r.id === "text.deleted")?.baseVersion).toBe(8);
});
it("rejects future content, duplicate entities and incomplete structure", () => {
  const records = base();
  expect(() => documentFromSync([...records, records[0]], 2)).toThrow();
  const block = records.find((r) => r.kind === "block")!;
  block.data = { id: block.id, type: "future" };
  expect(() => documentFromSync(records, 2)).toThrow();
  expect(() =>
    documentFromSync(
      records.filter((r) => r.kind !== "document"),
      2,
    ),
  ).toThrow();
});
