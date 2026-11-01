import { describe, expect, it } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  type CanvasNote,
} from "@nomi/core";
import { resolveNoteDrop } from "./note-drop";
const notes: CanvasNote[] = [
  { id: "a", title: "A", blocks: [] },
  { id: "child", title: "Child", parentId: "a", blocks: [] },
  { id: "leaf", title: "Leaf", parentId: "child", blocks: [] },
  { id: "b", title: "B", blocks: [] },
  { id: "c", title: "C", blocks: [] },
];
describe("note tree drop", () => {
  const expanded: CanvasNote[] = [
    { id: "a", title: "A", blocks: [] },
    { id: "b", title: "B", parentId: "a", blocks: [] },
    { id: "c", title: "C", parentId: "a", blocks: [] },
    { id: "d", title: "D", blocks: [] },
  ];
  it("treats A's bottom and B's top as the same gap, inserting C before B", () => {
    const bottom = resolveNoteDrop(expanded, "c", "a", "after", "b");
    expect(bottom).toEqual({ parentId: "a", before: "b" });
    expect(resolveNoteDrop(expanded, "c", "b", "before")).toEqual(bottom);
    const doc = createCanvasDocument();
    doc.notes = structuredClone(expanded);
    doc.board.placements = [];
    const result = applyCanvasCommands(doc, doc.revision, [
      { type: "move_note", id: "c", ...bottom! },
    ]);
    expect(
      result.notes.filter((n) => n.parentId === "a").map((n) => n.id),
    ).toEqual(["c", "b"]);
  });
  it("inserts an external subtree into the first visible child gap", () => {
    expect(resolveNoteDrop(expanded, "d", "a", "after", "b")).toEqual({
      parentId: "a",
      before: "b",
    });
    expect(resolveNoteDrop(expanded, "a", "a", "after", "b")).toBeUndefined();
    expect(resolveNoteDrop(expanded, "b", "a", "after", "b")).toBeUndefined();
  });
  it("retains collapsed subtree placement and uses visible children when search hides earlier siblings", () => {
    expect(resolveNoteDrop(expanded, "b", "a", "after", "d")).toEqual({
      parentId: null,
      before: "d",
    });
    expect(resolveNoteDrop(expanded, "d", "a", "after", "d")).toBeUndefined();
    expect(resolveNoteDrop(expanded, "d", "a", "after", "c")).toEqual({
      parentId: "a",
      before: "c",
    });
    expect(resolveNoteDrop(expanded, "c", "a", "inside")).toBeUndefined();
  });
  it.each(["a", "child", "leaf"])(
    "rejects self or descendant target %s",
    (id) => {
      for (const position of ["inside", "before", "after"] as const)
        expect(resolveNoteDrop(notes, "a", id, position)).toBeUndefined();
    },
  );
  it("moves before and after siblings without letting interleaved descendants affect ordering", () => {
    expect(resolveNoteDrop(notes, "c", "a", "before")).toEqual({
      parentId: null,
      before: "a",
    });
    expect(resolveNoteDrop(notes, "c", "a", "after")).toEqual({
      parentId: null,
      before: "b",
    });
    expect(resolveNoteDrop(notes, "a", "c", "after")).toEqual({
      parentId: null,
    });
  });
  it("nests a subtree, promotes children, and supports root end", () => {
    expect(resolveNoteDrop(notes, "a", "b", "inside")).toEqual({
      parentId: "b",
    });
    expect(resolveNoteDrop(notes, "child", "b", "before")).toEqual({
      parentId: null,
      before: "b",
    });
    expect(resolveNoteDrop(notes, "child", null, "after")).toEqual({
      parentId: null,
    });
  });
  it("ignores unchanged order and missing notes", () => {
    expect(resolveNoteDrop(notes, "a", "b", "before")).toBeUndefined();
    expect(resolveNoteDrop(notes, "b", "a", "after")).toBeUndefined();
    expect(resolveNoteDrop(notes, "child", "a", "inside")).toBeUndefined();
    expect(resolveNoteDrop(notes, "c", null, "after")).toBeUndefined();
    expect(resolveNoteDrop(notes, "missing", "a", "inside")).toBeUndefined();
    expect(resolveNoteDrop(notes, "a", "missing", "inside")).toBeUndefined();
  });
  it("uses unfiltered siblings and produces an atomic semantic move preserving descendants and content", () => {
    const doc = createCanvasDocument();
    doc.notes = structuredClone(notes);
    doc.board.placements = [];
    const move = resolveNoteDrop(notes, "child", "b", "inside")!;
    const next = applyCanvasCommands(doc, doc.revision, [
      { type: "move_note", id: "child", ...move },
    ]);
    expect(next.notes.find((n) => n.id === "child")?.parentId).toBe("b");
    expect(next.notes.find((n) => n.id === "leaf")?.parentId).toBe("child");
    expect(next.blocks).toEqual(doc.blocks);
    expect(next.board).toEqual(doc.board);
    expect(doc.notes).toEqual(notes);
  });
});
