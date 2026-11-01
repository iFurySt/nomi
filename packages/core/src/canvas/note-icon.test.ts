import { expect, it } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  parseCanvasDocument,
  type NoteIcon,
} from "./document";
import { planNoteExport } from "./note-export";
const image = {
  id: "icon.test",
  name: "icon.png",
  mime: "image/png",
  bytes: 1,
  sha256: "a".repeat(64),
};
it.each(["😀", "🧑🏽‍💻", "❤️", "🇨🇳", "1️⃣"])(
  "preserves Unicode %s without changing content or old snapshots",
  (value) => {
    const before = createCanvasDocument();
    const after = applyCanvasCommands(before, before.revision, [
      {
        type: "set_note_icon",
        id: before.notes[0].id,
        icon: { type: "emoji", value },
      },
    ]);
    expect(parseCanvasDocument(JSON.stringify(after)).notes[0].icon).toEqual({
      type: "emoji",
      value,
    });
    expect(before.notes[0].icon).toBeUndefined();
    expect(after.blocks).toEqual(before.blocks);
    const removed = applyCanvasCommands(after, after.revision, [
      { type: "set_note_icon", id: before.notes[0].id, icon: null },
    ]);
    expect(removed.notes).toEqual(before.notes);
  },
);
it.each(["", "abc", "😀😀", "😀\n"])("rejects non-icon string %j", (value) => {
  const d = createCanvasDocument();
  expect(() =>
    applyCanvasCommands(d, d.revision, [
      {
        type: "set_note_icon",
        id: d.notes[0].id,
        icon: { type: "emoji", value },
      },
    ]),
  ).toThrow();
});
it("requires safe local image assets and rejects missing assets/URL icons", () => {
  const d = createCanvasDocument();
  for (const icon of [
    { type: "image", asset: "missing" },
    { type: "image", url: "https://example.test/icon.png" },
  ]) {
    expect(() =>
      applyCanvasCommands(d, d.revision, [
        { type: "set_note_icon", id: d.notes[0].id, icon: icon as NoteIcon },
      ]),
    ).toThrow();
  }
  expect(() =>
    applyCanvasCommands(d, d.revision, [
      {
        type: "set_note_icon",
        id: d.notes[0].id,
        icon: { type: "image", asset: image.id },
        asset: { ...image, mime: "image/svg+xml" },
      },
    ]),
  ).toThrow();
});
it("keeps shared image references, exports icons, and collects only unreferenced icon assets", () => {
  const d = createCanvasDocument();
  const a = applyCanvasCommands(d, d.revision, [
    {
      type: "set_note_icon",
      id: d.notes[0].id,
      icon: { type: "image", asset: image.id },
      asset: image,
    },
    {
      type: "set_note_icon",
      id: d.notes[1].id,
      icon: { type: "image", asset: image.id },
    },
  ]);
  const exported = planNoteExport(a, a.notes[0].id, {
    format: "markdown",
    slug: "test",
    date: "2026-11-01",
    lang: "zh",
    tags: [],
  });
  expect(exported.snapshot.assets).toEqual([image]);
  const b = applyCanvasCommands(a, a.revision, [
    { type: "delete_note", id: a.notes[0].id },
  ]);
  expect(b.assets).toEqual([image]);
  const c = applyCanvasCommands(b, b.revision, [
    { type: "set_note_icon", id: b.notes[0].id, icon: null },
  ]);
  expect(c.assets).toEqual([]);
  expect(a.assets).toEqual([image]);
});
it("does not remove an icon asset still used by a content block", () => {
  const d = createCanvasDocument();
  const a = applyCanvasCommands(d, d.revision, [
    {
      type: "set_note_icon",
      id: d.notes[0].id,
      icon: { type: "image", asset: image.id },
      asset: image,
    },
    {
      type: "add_block",
      block: { id: "image.test", type: "image", asset: image.id },
      noteId: d.notes[1].id,
    },
  ]);
  expect(
    applyCanvasCommands(a, a.revision, [
      { type: "delete_note", id: a.notes[0].id },
    ]).assets,
  ).toEqual([image]);
});
