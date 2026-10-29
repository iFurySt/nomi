import { describe, it, expect } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  parseCanvasDocument,
} from "./document";
describe("delete note", () => {
  it("removes the note, its placements and attached connections while retaining shared originals", () => {
    const doc = createCanvasDocument();
    doc.notes[1].blocks.push("text.start");
    doc.board.placements.push({
      id: "place.copy",
      content: "note.start",
      x: 10,
      y: 20,
      width: 300,
    });
    doc.board.connectors = [
      {
        id: "edge",
        from: { placement: "place.start", side: "e" },
        to: { placement: "place.questions", side: "w" },
        routing: "straight",
        style: "solid",
        startArrow: false,
        endArrow: true,
        label: "",
      },
    ];
    const next = applyCanvasCommands(doc, doc.revision, [
      { type: "delete_note", id: "note.start" },
    ]);
    expect(next.notes.map((n) => n.id)).toEqual(["note.questions"]);
    expect(next.board.placements.some((p) => p.content === "note.start")).toBe(
      false,
    );
    expect(next.board.connectors).toEqual([]);
    expect(next.blocks.find((b) => b.id === "text.start")).toEqual(
      doc.blocks[0],
    );
    expect(parseCanvasDocument(next)).toEqual(next);
    expect(doc.notes).toHaveLength(2);
  });
  it("removes exclusive blocks and permits deleting the final note", () => {
    const doc = createCanvasDocument();
    const next = applyCanvasCommands(doc, doc.revision, [
      { type: "delete_note", id: "note.start" },
      { type: "delete_note", id: "note.questions" },
    ]);
    expect(next.notes).toEqual([]);
    expect(next.blocks.map((b) => b.id)).toEqual(["interactive.temperature"]);
    expect(() =>
      applyCanvasCommands(doc, doc.revision, [
        { type: "delete_note", id: "missing" },
      ]),
    ).toThrow();
  });
});
