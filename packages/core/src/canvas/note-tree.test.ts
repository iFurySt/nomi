import { describe, expect, it } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  parseCanvasDocument,
} from "./document";
import { noteAncestors, noteSubtreeIds } from "./note-tree";
import { planNoteExport } from "./note-export";

function nested() {
  const doc = createCanvasDocument();
  return applyCanvasCommands(doc, doc.revision, [
    {
      type: "add_block",
      block: { id: "text.child", type: "markdown", source: "child original" },
    },
    {
      type: "add_note",
      note: {
        id: "note.child",
        title: "Child",
        parentId: "note.start",
        blocks: ["text.child", "text.start"],
      },
    },
    {
      type: "add_note",
      note: {
        id: "note.leaf",
        title: "Leaf",
        parentId: "note.child",
        blocks: ["text.child"],
      },
    },
    {
      type: "place",
      placement: {
        id: "place.child",
        content: "note.child",
        x: 0,
        y: 0,
        width: 200,
      },
    },
  ]);
}
describe("document hierarchy", () => {
  it("round trips flat legacy documents without rewriting and accepts nested references in any array order", () => {
    const legacy = createCanvasDocument();
    expect(parseCanvasDocument(JSON.stringify(legacy))).toEqual(legacy);
    const doc = nested();
    doc.notes.reverse();
    expect(parseCanvasDocument(JSON.stringify(doc))).toEqual(doc);
    expect(noteAncestors(doc.notes, "note.leaf").map((n) => n.id)).toEqual([
      "note.start",
      "note.child",
    ]);
    expect([...noteSubtreeIds(doc.notes, "note.start")].sort()).toEqual([
      "note.child",
      "note.leaf",
      "note.start",
    ]);
  });
  it.each(["missing", "text.start", "note.child", "note.leaf"])(
    "rejects dangling or cyclic parent %s atomically",
    (parentId) => {
      const doc = nested(),
        before = structuredClone(doc);
      expect(() =>
        applyCanvasCommands(doc, doc.revision, [
          { type: "move_note", id: "note.child", parentId },
        ]),
      ).toThrow();
      expect(doc).toEqual(before);
    },
  );
  it("rejects cycles imported directly through the DSL", () => {
    const doc = nested();
    doc.notes.find((n) => n.id === "note.start")!.parentId = "note.leaf";
    expect(() => parseCanvasDocument(doc)).toThrow(/循环/);
  });
  it("moves a subtree without duplicating text or placements and supports sibling ordering / root promotion", () => {
    const doc = nested();
    const moved = applyCanvasCommands(doc, doc.revision, [
      { type: "move_note", id: "note.child", parentId: "note.questions" },
    ]);
    expect(noteAncestors(moved.notes, "note.leaf").map((n) => n.id)).toEqual([
      "note.questions",
      "note.child",
    ]);
    expect(moved.blocks).toEqual(doc.blocks);
    expect(moved.board).toEqual(doc.board);
    const root = applyCanvasCommands(moved, moved.revision, [
      {
        type: "move_note",
        id: "note.child",
        parentId: null,
        before: "note.start",
      },
    ]);
    expect(root.notes[0].id).toBe("note.child");
    expect(root.notes[0]).not.toHaveProperty("parentId");
    expect(root.notes.find((n) => n.id === "note.leaf")?.parentId).toBe(
      "note.child",
    );
    expect(() =>
      applyCanvasCommands(root, root.revision, [
        {
          type: "move_note",
          id: "note.start",
          parentId: null,
          before: "note.leaf",
        },
      ]),
    ).toThrow(/同级/);
  });
  it("deletes the entire subtree and its connectors while retaining externally shared content", () => {
    const doc = nested();
    doc.notes.find((n) => n.id === "note.questions")!.blocks.push("text.start");
    doc.board.connectors = [
      {
        id: "edge.child",
        from: { placement: "place.child", side: "e" },
        to: { placement: "place.questions", side: "w" },
        label: "",
        style: "solid",
        routing: "rounded",
        startArrow: false,
        endArrow: true,
      },
    ];
    const base = parseCanvasDocument(doc);
    const deleted = applyCanvasCommands(base, base.revision, [
      { type: "delete_note", id: "note.start" },
    ]);
    expect(deleted.notes.map((n) => n.id)).toEqual(["note.questions"]);
    expect(
      deleted.board.placements.some(
        (p) => p.content === "note.child" || p.content === "note.start",
      ),
    ).toBe(false);
    expect(deleted.blocks.some((b) => b.id === "text.child")).toBe(false);
    expect(deleted.blocks.some((b) => b.id === "text.start")).toBe(true);
    expect(parseCanvasDocument(deleted)).toEqual(deleted);
    expect(base.notes.length).toBe(4);
    expect(deleted.board.connectors).toEqual([]);
  });
  it("exports a child alone without leaking or dangling its parent relationship", () => {
    const doc = nested(),
      before = structuredClone(doc);
    const exported = planNoteExport(doc, "note.child", {
      format: "markdown",
      slug: "child",
      date: "2026-10-29",
      lang: "zh",
      tags: [],
    });
    expect(exported.snapshot.notes).toHaveLength(1);
    expect(exported.snapshot.notes[0]).not.toHaveProperty("parentId");
    expect(parseCanvasDocument(exported.snapshot)).toEqual(exported.snapshot);
    expect(doc).toEqual(before);
  });
});
