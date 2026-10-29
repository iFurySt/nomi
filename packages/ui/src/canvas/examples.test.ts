import { describe, it, expect } from "vitest";
import { createCanvasDocument, applyCanvasCommands } from "@nomi/core";
import { canvasAssetDigest } from "@nomi/platform";
import {
  buildCanvasExamples,
  canvasExampleStops,
  createCanvasExamplePdf,
} from "./examples";
const image = () =>
  new Blob(
    [
      Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=",
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    { type: "image/png" },
  );
describe("canvas example collection", () => {
  it("adds every implemented content type with reusable originals and leaves current work intact", async () => {
    const before = createCanvasDocument();
    before.board.placements[0].x = -840;
    const batch = await buildCanvasExamples(before, image());
    const after = applyCanvasCommands(before, before.revision, batch.commands);
    expect(after.board.placements).toHaveLength(
      before.board.placements.length + 11,
    );
    expect(new Set(after.blocks.map((b) => b.type))).toEqual(
      new Set(["markdown", "image", "file", "interactive", "shape"]),
    );
    expect(after.notes.slice(0, before.notes.length)).toEqual(before.notes);
    expect(after.blocks.slice(0, before.blocks.length)).toEqual(before.blocks);
    expect(
      after.board.placements.slice(0, before.board.placements.length),
    ).toEqual(before.board.placements);
    expect(batch.assets).toHaveLength(3);
    expect(after.board.connectors).toHaveLength(2);
    expect(after.board.connectors![1]).toMatchObject({
      style: "dashed",
      endArrow: true,
    });
    for (const item of batch.assets) {
      expect(item.asset.sha256).toBe(await canvasAssetDigest(item.blob));
      expect(item.asset.bytes).toBe(item.blob.size);
    }
    const first = after.board.placements.find(
      (p) => p.id === canvasExampleStops[0].id,
    )!;
    expect(
      after.board.placements.find((p) => p.id === canvasExampleStops[7].id)!
        .content,
    ).toBe(first.content);
    expect(
      after.notes.find((n) => n.id === "examples.v1.note.mixed")!.blocks,
    ).toEqual([
      "examples.v1.text.mixed",
      "examples.v1.block.image",
      "examples.v1.block.textfile",
      "examples.v1.block.interactive",
    ]);
  });
  it("keeps edited samples on repeat and restores only a removed placement", async () => {
    const before = createCanvasDocument(),
      batch = await buildCanvasExamples(before, image());
    let doc = applyCanvasCommands(before, before.revision, batch.commands);
    doc = applyCanvasCommands(doc, doc.revision, [
      {
        type: "set_markdown",
        id: "examples.v1.text.markdown",
        source: "我的修改",
      },
      { type: "move", id: canvasExampleStops[0].id, x: 9000, y: -600 },
    ]);
    expect((await buildCanvasExamples(doc, image())).commands).toEqual([]);
    doc = applyCanvasCommands(doc, doc.revision, [
      { type: "remove_placement", id: canvasExampleStops[7].id },
    ]);
    const restore = await buildCanvasExamples(doc, image());
    expect(restore.commands).toHaveLength(1);
    expect(restore.assets).toEqual([]);
    const restored = applyCanvasCommands(doc, doc.revision, restore.commands);
    expect(
      restored.blocks.find((b) => b.id === "examples.v1.text.markdown"),
    ).toHaveProperty("source", "我的修改");
    expect(
      restored.board.placements.find((p) => p.id === canvasExampleStops[0].id)!
        .x,
    ).toBe(9000);
  });
  it("provides a real one-page PDF with valid byte offsets", async () => {
    const blob = createCanvasExamplePdf(),
      source = await blob.text();
    expect(blob.type).toBe("application/pdf");
    expect(source.startsWith("%PDF-1.4\n")).toBe(true);
    const xref = Number(source.match(/startxref\n(\d+)/)![1]);
    expect(source.slice(xref, xref + 4)).toBe("xref");
    expect(source).toContain("/Count 1");
    expect(source).toContain("/MediaBox [0 0 612 792]");
    const offsets = [...source.matchAll(/(\d{10}) 00000 n /g)].map((m) =>
      Number(m[1]),
    );
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, i) =>
      expect(source.slice(offset)).toMatch(new RegExp(`^${i + 1} 0 obj`)),
    );
  });
});
