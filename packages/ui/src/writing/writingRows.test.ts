import { describe, it, expect } from "vitest";
import { createCanvasDocument } from "@nomi/core";
import { writingRows } from "./writingRows";
describe("continuous article input", () => {
  it("shows one input for adjacent empty text blocks without rewriting authored data", () => {
    const doc = createCanvasDocument();
    doc.blocks.push(
      { id: "empty.one", type: "markdown", source: "" },
      { id: "empty.two", type: "markdown", source: "" },
    );
    doc.notes[0].blocks = ["empty.one", "empty.two"];
    const original = structuredClone(doc);
    const rows = writingRows(doc, doc.notes[0], () => "draft");
    expect(rows).toHaveLength(1);
    expect(rows[0].block.id).toBe("empty.one");
    expect(rows[0].emptyPeers).toEqual(["empty.two"]);
    expect(doc).toEqual(original);
  });
  it("keeps text and separate writing positions around embeds", () => {
    const doc = createCanvasDocument();
    doc.blocks.push({ id: "empty", type: "markdown", source: "" });
    doc.notes[0].blocks = ["empty", "interactive.temperature", "text.start"];
    const rows = writingRows(doc, doc.notes[0], () => "draft");
    expect(rows.map((row) => row.block.id)).toEqual(doc.notes[0].blocks);
    expect(rows[2].block).toHaveProperty(
      "source",
      (doc.blocks.find((b) => b.id === "text.start") as { source: string })
        .source,
    );
  });
  it("offers text before and after embeds without mutating or serializing placeholder blocks", () => {
    const doc = createCanvasDocument();
    doc.notes[0].blocks = ["interactive.temperature"];
    const original = structuredClone(doc);
    const rows = writingRows(
      doc,
      doc.notes[0],
      (after) => `draft.${after || "start"}`,
    );
    expect(rows.map((r) => r.block.type)).toEqual([
      "markdown",
      "interactive",
      "markdown",
    ]);
    expect(rows[0].draft).toBe(true);
    expect(rows[2].after).toBe("interactive.temperature");
    expect(doc).toEqual(original);
  });
  it("reuses the draft identity after typing and needs no extra blank block after text", () => {
    const doc = createCanvasDocument();
    doc.notes[0].blocks = ["interactive.temperature", "new.text"];
    doc.blocks.push({ id: "new.text", type: "markdown", source: "继续写" });
    const rows = writingRows(doc, doc.notes[0], () => "draft");
    expect(rows.at(-1)?.block.id).toBe("new.text");
    expect(rows).toHaveLength(3);
  });
});
