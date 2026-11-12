import { describe, it, expect } from "vitest";
import {
  applyOperations,
  documentChanges,
  reverseChanges,
  readDocumentTool,
} from "./document";
import { parseTool } from "./contract";
import {
  createCanvasDocument,
  parseCanvasDocument,
  type CanvasDocument,
} from "../canvas/index";
const fixture = (): CanvasDocument =>
  parseCanvasDocument({
    ...createCanvasDocument(),
    notes: [
      { id: "a", title: "A", blocks: ["text"] },
      { id: "b", title: "B", blocks: [] },
    ],
    blocks: [{ id: "text", type: "markdown", source: "hello world" }],
    assets: [],
    board: { id: "board", placements: [] },
  });
describe("automation document operations", () => {
  it("creates, reads, updates, moves and trashes/restores a subtree atomically", () => {
    const d = fixture();
    const a = applyOperations(d, [
      {
        type: "create_note",
        noteId: "child",
        parentId: "a",
        title: "Child",
        markdown: "body",
      },
      {
        type: "update_note",
        noteId: "a",
        title: "Parent",
        icon: { type: "emoji", value: "😀" },
      },
      { type: "move_note", noteId: "a", parentId: "b" },
    ]).document;
    expect(a.revision).toBe(d.revision + 1);
    expect(a.notes.find((n) => n.id === "a")?.parentId).toBe("b");
    expect(() =>
      applyOperations(a, [
        { type: "trash_note", noteId: "a", includeChildren: false },
      ]),
    ).toThrow("HAS_CHILDREN");
    const b = applyOperations(a, [
      { type: "trash_note", noteId: "a", includeChildren: true },
    ]).document;
    expect(b.notes.map((n) => n.id)).toEqual(["b"]);
    const restored = reverseChanges(b, documentChanges(a, b));
    expect(restored.notes).toEqual(a.notes);
    expect(restored.blocks).toEqual(a.blocks);
  });
  it("fails complete batches without mutating input, validates identities and cycles", () => {
    const d = fixture(),
      before = structuredClone(d);
    expect(() =>
      applyOperations(d, [
        { type: "update_note", noteId: "a", title: "changed" },
        {
          type: "insert_blocks",
          noteId: "a",
          blocks: [{ type: "markdown", source: "x" }],
          beforeBlockId: "missing",
        },
      ]),
    ).toThrow();
    expect(d).toEqual(before);
    expect(() =>
      applyOperations(d, [{ type: "move_note", noteId: "a", parentId: "a" }]),
    ).toThrow();
    expect(() =>
      applyOperations(d, [
        {
          type: "insert_blocks",
          noteId: "a",
          blocks: [{ id: "text", type: "markdown", source: "x" }],
        },
      ]),
    ).toThrow();
  });
  it("edits exact unique text only; never erases non-text content", () => {
    const d = fixture();
    expect(
      applyOperations(d, [
        {
          type: "edit_text",
          blockId: "text",
          oldText: "world",
          newText: "Nomi",
          allowShared: false,
        },
      ]).document.blocks[0],
    ).toMatchObject({ source: "hello Nomi" });
    expect(() =>
      applyOperations(d, [
        {
          type: "edit_text",
          blockId: "text",
          oldText: "l",
          newText: "x",
          allowShared: false,
        },
      ]),
    ).toThrow("AMBIGUOUS");
    expect(() =>
      applyOperations(d, [
        {
          type: "edit_text",
          blockId: "text",
          oldText: "gone",
          newText: "x",
          allowShared: false,
        },
      ]),
    ).toThrow("TEXT_NOT_FOUND");
  });
  it("requires explicit shared writes and detaches rather than destroying references", () => {
    const d = fixture();
    d.notes[1].blocks = ["text"];
    expect(() =>
      applyOperations(d, [
        {
          type: "edit_text",
          blockId: "text",
          oldText: "world",
          newText: "x",
          allowShared: false,
        },
      ]),
    ).toThrow("SHARED_BLOCK");
    const next = applyOperations(d, [
      { type: "remove_blocks", noteId: "a", blockIds: ["text"] },
    ]).document;
    expect(next.blocks).toEqual(d.blocks);
    expect(next.notes[1].blocks).toEqual(["text"]);
  });
  it("moves references, preserves unrelated edits on restore, rejects conflicts", () => {
    const d = fixture();
    const next = applyOperations(d, [
      {
        type: "edit_text",
        blockId: "text",
        oldText: "world",
        newText: "Nomi",
        allowShared: false,
      },
    ]).document;
    const later = applyOperations(next, [
      { type: "update_note", noteId: "b", title: "later" },
    ]).document;
    const restored = reverseChanges(later, documentChanges(d, next));
    expect(restored.notes[1].title).toBe("later");
    expect(restored.blocks).toEqual(d.blocks);
    const conflict = applyOperations(next, [
      {
        type: "edit_text",
        blockId: "text",
        oldText: "Nomi",
        newText: "someone",
        allowShared: false,
      },
    ]).document;
    expect(() => reverseChanges(conflict, documentChanges(d, next))).toThrow(
      "RESTORE_CONFLICT",
    );
    expect(
      applyOperations(d, [
        {
          type: "move_blocks",
          noteId: "a",
          targetNoteId: "b",
          blockIds: ["text"],
        },
      ]).document.notes.map((n) => n.blocks),
    ).toEqual([[], ["text"]]);
  });
  it("returns typed source, bounded search, links and shared-block references", () => {
    const d = fixture();
    d.notes[1].blocks = ["link"];
    d.blocks.push({
      id: "link",
      type: "note-reference",
      documentId: d.id,
      noteId: "a",
      title: "A",
    });
    expect(
      readDocumentTool(d, "search", {
        workspaceId: d.id,
        query: "world",
        offset: 0,
        limit: 1,
      }),
    ).toMatchObject({ total: 1, items: [{ noteId: "a", blockId: "text" }] });
    expect(
      readDocumentTool(d, "get_references", {
        workspaceId: d.id,
        noteId: "a",
        direction: "incoming",
        offset: 0,
        limit: 10,
      }),
    ).toMatchObject({ items: [{ kind: "link", noteId: "b" }] });
    expect(() =>
      readDocumentTool(d, "get_note", { workspaceId: "wrong", noteId: "a" }),
    ).toThrow("WORKSPACE_MISMATCH");
  });
  it("restores after storage reordered JSON object keys", () => {
    const d = fixture();
    const after = applyOperations(d, [
      { type: "update_note", noteId: "a", title: "Changed" },
    ]).document;
    const reopened = structuredClone(after);
    reopened.notes[0] = {
      blocks: reopened.notes[0].blocks,
      title: "Changed",
      id: "a",
    };
    expect(
      reverseChanges(reopened, documentChanges(d, after)).notes[0].title,
    ).toBe("A");
  });
  it("validates strict input schemas, required revisions and bounded pagination", () => {
    expect(() => parseTool("create_note", { title: "x" })).toThrow();
    expect(() => parseTool("get_context", { arbitraryPath: "/tmp" })).toThrow();
    expect(() =>
      parseTool("list_notes", { workspaceId: "w", limit: 101 }),
    ).toThrow();
    expect(() =>
      parseTool("edit_text", {
        workspaceId: "w",
        expectedRevision: 1,
        requestId: "a",
        blockId: "text",
        oldText: "",
        newText: "x",
      }),
    ).toThrow();
  });
});
