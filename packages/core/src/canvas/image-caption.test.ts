import { describe, expect, it } from "vitest";
import {
  createCanvasDocument,
  applyCanvasCommands,
  parseCanvasDocument,
} from "./document";
import { planNoteExport } from "./note-export";
function fixture() {
  const doc = createCanvasDocument();
  doc.assets.push({
    id: "image.asset",
    name: "sample.png",
    mime: "image/png",
    bytes: 1,
    sha256: "0".repeat(64),
  });
  doc.blocks.push({ id: "image.block", type: "image", asset: "image.asset" });
  doc.notes[0].blocks.push("image.block");
  return doc;
}
describe("authored image captions", () => {
  it("round trips a caption without changing the original asset, and exports it as text", () => {
    const before = fixture();
    const after = applyCanvasCommands(before, before.revision, [
      {
        type: "set_image_caption",
        id: "image.block",
        caption: "图 1 · Q、K 与 V 的关系",
      },
    ]);
    expect(after.assets).toEqual(before.assets);
    expect(before.blocks.at(-1)).not.toHaveProperty("caption");
    expect(parseCanvasDocument(JSON.parse(JSON.stringify(after)))).toEqual(
      after,
    );
    const exported = planNoteExport(after, "note.start", {
      format: "markdown",
      slug: "caption",
      date: "2026-10-25",
      lang: "zh",
      tags: [],
    });
    expect(exported.snapshot.blocks.at(-1)).toHaveProperty(
      "caption",
      "图 1 · Q、K 与 V 的关系",
    );
    expect(exported.markdown).toContain("*图 1 · Q、K 与 V 的关系*");
    expect(
      applyCanvasCommands(after, after.revision, [
        { type: "set_image_caption", id: "image.block", caption: "" },
      ]).blocks.at(-1),
    ).not.toHaveProperty("caption");
  });
  it("rejects invalid caption targets and oversized captions atomically", () => {
    const doc = fixture();
    for (const command of [
      { type: "set_image_caption" as const, id: "text.start", caption: "bad" },
      {
        type: "set_image_caption" as const,
        id: "image.block",
        caption: "x".repeat(2001),
      },
    ])
      expect(() => applyCanvasCommands(doc, doc.revision, [command])).toThrow();
    expect(doc.blocks.at(-1)).not.toHaveProperty("caption");
  });
});
