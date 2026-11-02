import { expect, it } from "vitest";
import {
  createCanvasDocument,
  parseCanvasDocument,
  applyCanvasCommands,
} from "./document";
import { planNoteExport } from "./note-export";

function fixture() {
  const d = createCanvasDocument();
  d.blocks.push({
    id: "ref.test",
    type: "note-reference",
    documentId: d.id,
    noteId: d.notes[1].id,
    title: "Fallback title",
  });
  d.notes[0].blocks.push("ref.test");
  return d;
}
it("retains references after deleting the target without deleting the owner or other content", () => {
  const d = fixture(),
    target = d.notes[1].id;
  const changed = applyCanvasCommands(d, d.revision, [
    { type: "delete_note", id: target },
  ]);
  expect(changed.blocks.find((b) => b.id === "ref.test")).toEqual(
    d.blocks.at(-1),
  );
  expect(changed.notes[0].blocks).toContain("ref.test");
  expect(parseCanvasDocument(changed)).toEqual(changed);
});
it("validates reference IDs and fallback titles while permitting absent targets", () => {
  const d = fixture(),
    b = d.blocks.at(-1)!;
  expect(parseCanvasDocument(d)).toEqual(d);
  expect(() =>
    parseCanvasDocument({
      ...d,
      blocks: [...d.blocks.slice(0, -1), { ...b, noteId: "../escape" }],
    }),
  ).toThrow();
  expect(() =>
    parseCanvasDocument({
      ...d,
      blocks: [...d.blocks.slice(0, -1), { ...b, title: 123 }],
    }),
  ).toThrow();
  expect(
    parseCanvasDocument({
      ...d,
      blocks: [...d.blocks.slice(0, -1), { ...b, noteId: "note.missing" }],
    }).blocks.at(-1),
  ).toMatchObject({ noteId: "note.missing" });
});
it("exports a reference name without leaking target content and preserves its DSL", () => {
  const d = fixture();
  d.notes[1].title = "Updated target";
  const result = planNoteExport(d, d.notes[0].id, {
    format: "markdown",
    slug: "test",
    date: "2026-11-02",
    lang: "zh",
    tags: [],
  });
  expect(result.markdown).toContain("Updated target（文稿引用）");
  expect(result.snapshot.notes).toHaveLength(1);
  expect(result.snapshot.blocks.at(-1)).toEqual(d.blocks.at(-1));
  expect(result.warnings).toContain(
    "文稿引用仅导出名称，不包含目标正文。请在 Nomi 中打开引用。",
  );
});
