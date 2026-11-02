import { describe, it, expect } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  type CanvasDocument,
} from "@nomi/core";
import {
  selectionSnapshot,
  selectionCopyText,
  parseSelectionCopy,
  pasteSelection,
} from "./selectionClipboard";
function fixture(): CanvasDocument {
  const d = createCanvasDocument();
  d.board.placements[0].group = "group.test";
  d.board.placements[0].locked = true;
  d.blocks.push({
    id: "shape.a",
    type: "shape",
    shape: "star",
    text: "A",
    tone: "sage",
    shapeStyle: { stroke: "#112233", text: { bold: true } },
  });
  d.board.placements.push({
    id: "place.shape",
    content: "shape.a",
    x: 800,
    y: 100,
    width: 200,
    height: 150,
    group: "group.test",
  });
  d.board.connectors = [
    {
      id: "c.inside",
      from: { placement: d.board.placements[0].id, side: "e" },
      to: { placement: "place.shape", side: "w" },
      routing: "rounded",
      style: "dashed",
      startArrow: false,
      endArrow: true,
      label: "内部",
      waypoints: [
        { x: 700, y: 80 },
        { x: 750, y: 80 },
      ],
    },
    {
      id: "c.outside",
      from: { placement: d.board.placements[0].id, side: "s" },
      to: { placement: d.board.placements[1].id, side: "n" },
      routing: "straight",
      style: "solid",
      startArrow: false,
      endArrow: true,
      label: "外部",
    },
  ];
  return d;
}
describe("canvas semantic selection clipboard", () => {
  it("copies a child alone as a standalone note without including its parent", () => {
    const doc = fixture();
    doc.notes[1].parentId = doc.notes[0].id;
    const snapshot = selectionSnapshot(doc, [doc.board.placements[1].id]);
    expect(snapshot.notes).toHaveLength(1);
    expect(snapshot.notes[0]).not.toHaveProperty("parentId");
    const paste = pasteSelection(doc, snapshot);
    const next = applyCanvasCommands(doc, doc.revision, paste.commands);
    expect(next.notes.at(-1)).not.toHaveProperty("parentId");
    expect(doc.notes[1].parentId).toBe(doc.notes[0].id);
  });
  it("remaps parent links when both parent and child are copied", () => {
    const doc = fixture();
    doc.notes[1].parentId = doc.notes[0].id;
    const snapshot = selectionSnapshot(
      doc,
      doc.board.placements.slice(0, 2).map((p) => p.id),
    );
    const paste = pasteSelection(doc, snapshot);
    const next = applyCanvasCommands(doc, doc.revision, paste.commands);
    const parent = next.notes.find(
      (n) => n.id !== doc.notes[0].id && n.title === doc.notes[0].title,
    )!;
    const child = next.notes.find(
      (n) => n.id !== doc.notes[1].id && n.title === doc.notes[1].title,
    )!;
    expect(child.parentId).toBe(parent.id);
    expect(parent.id).not.toBe(doc.notes[0].id);
  });

  it("clones independent content with remapped groups and internal bindings only", () => {
    const d = fixture(),
      ids = [d.board.placements[0].id, "place.shape"],
      snapshot = parseSelectionCopy(
        selectionCopyText(selectionSnapshot(d, ids)),
      ),
      paste = pasteSelection(d, snapshot),
      next = applyCanvasCommands(d, d.revision, paste.commands);
    expect(snapshot.board.connectors?.map((c) => c.id)).toEqual(["c.inside"]);
    const placed = next.board.placements.filter((p) =>
      paste.ids.includes(p.id),
    );
    expect(placed).toHaveLength(2);
    expect(placed.every((p) => !p.locked)).toBe(true);
    expect(placed[0].group).toBe(placed[1].group);
    expect(placed[0].group).not.toBe("group.test");
    expect(placed[0].content).not.toBe(d.board.placements[0].content);
    const note = next.notes.find((n) => n.id === placed[0].content)!;
    expect(note.blocks).not.toEqual(d.notes[0].blocks);
    const shape = next.blocks.find((b) => b.id === placed[1].content);
    expect(shape).toMatchObject({
      shape: "star",
      shapeStyle: { text: { bold: true } },
    });
    const c = next.board.connectors!.at(-1)!;
    expect(c.from.placement).toBe(placed[0].id);
    expect(c.to.placement).toBe(placed[1].id);
    expect(c.waypoints?.[0]).toEqual({ x: 724, y: 104 });
    expect(JSON.stringify(d)).not.toContain(paste.ids[0]);
  });
  it("preserves arbitrary boundary anchors while remapping pasted bindings", () => {
    const d = fixture();
    d.board.connectors![0].from = {
      placement: d.board.placements[0].id,
      side: "e",
      anchor: { x: 1, y: 0.25 },
    };
    d.board.connectors![0].to = {
      placement: "place.shape",
      side: "n",
      anchor: { x: 0.3, y: 0.1 },
    };
    const snapshot = parseSelectionCopy(
      selectionCopyText(
        selectionSnapshot(d, [d.board.placements[0].id, "place.shape"]),
      ),
    );
    const paste = pasteSelection(d, snapshot),
      next = applyCanvasCommands(d, d.revision, paste.commands),
      c = next.board.connectors!.at(-1)!;
    expect(c.from.anchor).toEqual({ x: 1, y: 0.25 });
    expect(c.to.anchor).toEqual({ x: 0.3, y: 0.1 });
    expect(c.from.placement).toBe(paste.ids[0]);
    expect(c.to.placement).toBe(paste.ids[1]);
  });
  it("rejects malformed payloads and absent attachment originals", () => {
    const d = fixture();
    expect(() =>
      parseSelectionCopy(
        '{"schema":"nomi-selection/v1","document":{},"script":"x"}',
      ),
    ).toThrow();
    expect(() => parseSelectionCopy("x".repeat(2097153))).toThrow();
    const s = selectionSnapshot(d, [d.board.placements[0].id]);
    s.assets.push({
      id: "asset.missing",
      name: "a.png",
      mime: "image/png",
      bytes: 2,
      sha256: "a".repeat(64),
    });
    expect(() => pasteSelection(d, s)).toThrow("原件");
  });
});

it("copies internal note references to copied targets and leaves external references intact", () => {
  const doc = createCanvasDocument();
  doc.blocks.push({
    id: "ref.child",
    type: "note-reference",
    documentId: doc.id,
    noteId: doc.notes[1].id,
    title: "Target",
  });
  doc.notes[0].blocks.push("ref.child");
  const places = doc.board.placements.filter((p) =>
    doc.notes.some((n) => n.id === p.content),
  );
  const both = selectionSnapshot(
    doc,
    places.map((p) => p.id),
  );
  const copied = applyCanvasCommands(
    doc,
    doc.revision,
    pasteSelection(doc, both).commands,
  );
  const copiedSource = copied.notes[doc.notes.length],
    copiedTarget = copied.notes[doc.notes.length + 1];
  expect(
    copied.blocks.find(
      (b) => copiedSource.blocks.includes(b.id) && b.type === "note-reference",
    ),
  ).toMatchObject({ noteId: copiedTarget.id, documentId: doc.id });
  const onlySource = selectionSnapshot(doc, [places[0].id]);
  const external = applyCanvasCommands(
    doc,
    doc.revision,
    pasteSelection(doc, onlySource).commands,
  );
  expect(external.blocks.at(-1)).toMatchObject({
    noteId: doc.notes[1].id,
    documentId: doc.id,
  });
});
