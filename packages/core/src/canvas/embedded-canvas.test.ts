import { expect, it } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  parseCanvasDocument,
  type CanvasBlock,
} from "./document";
import { emptyCanvasScene, remapCanvasAssets } from "./embedded-canvas";
import { planNoteExport } from "./note-export";
const fixture = () => {
  const doc = createCanvasDocument(),
    scene = emptyCanvasScene("scene.test");
  scene.blocks.push({
    id: "shape.one",
    type: "shape",
    shape: "rectangle",
    text: "Hello",
    tone: "neutral",
  });
  scene.board.placements.push({
    id: "place.one",
    content: "shape.one",
    x: -100,
    y: 40,
    width: 200,
    height: 100,
  });
  const block: Extract<CanvasBlock, { type: "canvas" }> = {
    id: "canvas.test",
    type: "canvas",
    scene,
  };
  return {
    doc: applyCanvasCommands(doc, doc.revision, [
      { type: "add_block", block, noteId: doc.notes[0].id },
    ]),
    block,
  };
};
it("stores an independent native scene and applies one atomic parent edit", () => {
  const { doc, block } = fixture(),
    before = structuredClone(doc);
  const scene = applyCanvasCommands(block.scene, 1, [
    { type: "move", id: "place.one", x: 600, y: 200 },
  ]);
  const next = applyCanvasCommands(doc, doc.revision, [
    { type: "set_canvas", block: { ...block, scene } },
  ]);
  expect(doc).toEqual(before);
  expect(next.board).toEqual(doc.board);
  expect(next.blocks.at(-1)).toMatchObject({
    scene: { board: { placements: [{ x: 600, y: 200 }] } },
  });
  expect(parseCanvasDocument(next)).toEqual(next);
  expect(() =>
    applyCanvasCommands(next, doc.revision, [{ type: "set_canvas", block }]),
  ).toThrow();
});
it("rejects recursive canvases, invalid inner references and missing originals", () => {
  const { doc, block } = fixture();
  const invalid = (scene: unknown) => ({
    ...doc,
    blocks: [...doc.blocks.slice(0, -1), { ...block, scene }],
  });
  expect(() =>
    parseCanvasDocument(invalid({ ...block.scene, blocks: [block] })),
  ).toThrow("再次嵌入");
  expect(() =>
    parseCanvasDocument(invalid({ ...block.scene, blocks: [] })),
  ).toThrow();
  const asset = {
    id: "asset.inner",
    name: "a.png",
    mime: "image/png",
    bytes: 1,
    sha256: "a".repeat(64),
  };
  expect(() =>
    parseCanvasDocument(invalid({ ...block.scene, assets: [asset] })),
  ).toThrow("附件引用");
});
it("permits scene-local identities in different blocks without coupling their content", () => {
  const { doc, block } = fixture();
  const other = { ...structuredClone(block), id: "canvas.other" };
  const both = applyCanvasCommands(doc, doc.revision, [
    { type: "add_block", block: other, noteId: doc.notes[0].id },
  ]);
  const changed = applyCanvasCommands(both, both.revision, [
    {
      type: "set_canvas",
      block: { ...block, scene: { ...block.scene, title: "Changed" } },
    },
  ]);
  expect(changed.blocks.find((b) => b.id === other.id)).toEqual(other);
  expect(changed.notes).toEqual(both.notes);
});
it("keeps nested originals in note exports and remaps asset identities on independent import", () => {
  const { doc, block } = fixture();
  const asset = {
    id: "asset.inner",
    name: "a.png",
    mime: "image/png",
    bytes: 1,
    sha256: "a".repeat(64),
  };
  const scene = {
    ...block.scene,
    assets: [asset],
    blocks: [
      ...block.scene.blocks,
      { id: "image.inner", type: "image" as const, asset: asset.id },
    ],
  };
  const updated = applyCanvasCommands(doc, doc.revision, [
    { type: "set_canvas", block: { ...block, scene } },
  ]);
  const exported = planNoteExport(updated, doc.notes[0].id, {
    format: "markdown",
    slug: "drawing",
    date: "2026-11-03",
    lang: "zh",
    tags: [],
  });
  expect(exported.snapshot.assets).toEqual([asset]);
  const remapped = remapCanvasAssets({ ...block, scene }, (id) => "new." + id);
  expect(remapped).toMatchObject({
    scene: {
      assets: [{ id: "new.asset.inner" }],
      blocks: [{}, { asset: "new.asset.inner" }],
    },
  });
  expect(exported.markdown).toContain("画布绘图");
});
