import { describe, it, expect } from "vitest";
import {
  createCanvasDocument,
  applyCanvasCommands,
  parseCanvasDocument,
} from "./document";
import { planNoteExport, noteFileId } from "./note-export";
const options = {
  format: "jekyll",
  slug: "transformer",
  date: "2026-10-25",
  lang: "zh",
  tags: ["AI"],
} as const;
describe("note publication", () => {
  it("keeps exact authored Markdown and selects only reachable content", () => {
    const doc = createCanvasDocument();
    doc.blocks[0] = {
      id: "text.start",
      type: "markdown",
      source: "作者的 **原文**\n\n$$X=\\begin{bmatrix}a\\\\b\\end{bmatrix}$$",
    };
    const result = planNoteExport(doc, "note.start", {
      ...options,
      tags: ["AI"],
    });
    expect(result.markdown).toContain(doc.blocks[0].source);
    expect(result.path).toBe("_posts/2026-10-25-transformer.md");
    expect(result.snapshot.blocks.map((b) => b.id)).toEqual(["text.start"]);
    expect(result.snapshot.notes).toHaveLength(1);
    expect(result.snapshot.board.placements).toEqual([]);
    expect(parseCanvasDocument(result.snapshot)).toEqual(result.snapshot);
  });
  it("exports executable viewer references and preserves interactive definitions", () => {
    const doc = createCanvasDocument();
    doc.notes[0].blocks.push("interactive.temperature");
    const result = planNoteExport(doc, "note.start", { ...options, tags: [] });
    expect(result.markdown).toContain("| relative_url");
    expect(result.markdown).toContain('sandbox="allow-scripts"');
    expect(
      result.snapshot.blocks.find((b) => b.type === "interactive"),
    ).toEqual(doc.blocks[2]);
    const md = planNoteExport(doc, "note.start", {
      ...options,
      format: "markdown",
      tags: [],
    });
    expect(md.markdown).toContain(
      `assets/nomi/transformer/${noteFileId("interactive.temperature")}.html`,
    );
  });
  it("keeps filenames distinct on case-insensitive filesystems", () => {
    expect(noteFileId("a.b")).not.toBe(noteFileId("a_b"));
    expect(noteFileId("A")).not.toBe(noteFileId("a"));
  });
  it("rejects unsafe filenames and impossible dates", () => {
    for (const slug of ["../secret", "a/b", 'x\" onload=1', ""])
      expect(() =>
        planNoteExport(createCanvasDocument(), "note.start", {
          ...options,
          slug,
          tags: [],
        }),
      ).toThrow();
    expect(() =>
      planNoteExport(createCanvasDocument(), "note.start", {
        ...options,
        date: "2026-02-30",
        tags: [],
      }),
    ).toThrow();
  });
  it("reorders or detaches note blocks atomically, retaining originals and placements", () => {
    const doc = createCanvasDocument();
    doc.notes[0].blocks.push("interactive.temperature");
    const next = applyCanvasCommands(doc, doc.revision, [
      {
        type: "set_note_blocks",
        id: "note.start",
        blocks: ["interactive.temperature", "text.start"],
      },
    ]);
    expect(next.notes[0].blocks).toEqual([
      "interactive.temperature",
      "text.start",
    ]);
    expect(next.blocks).toEqual(doc.blocks);
    expect(next.board).toEqual(doc.board);
    expect(() =>
      applyCanvasCommands(doc, doc.revision, [
        { type: "set_note_blocks", id: "note.start", blocks: ["missing"] },
      ]),
    ).toThrow();
    expect(doc.notes[0].blocks).toEqual([
      "text.start",
      "interactive.temperature",
    ]);
  });
});
