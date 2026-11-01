import { expect, it } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  parseCanvasDocument,
} from "./document";

it("retains additive fields through parsing, text edits and note transactions", () => {
  const raw: any = createCanvasDocument();
  raw.futureMetadata = { labels: ["study"], optional: null };
  raw.notes[0].futureBadge = { color: "blue" };
  raw.notes[0].icon = { type: "emoji", value: "💡", futureLabel: "Idea" };
  raw.blocks[0].futureLayout = { collapsed: true };
  raw.board.futureGrid = "dots";
  raw.board.placements[0].futureAlign = "start";
  const parsed = parseCanvasDocument(JSON.stringify(raw));
  expect(parsed).toEqual(raw);
  const edited = applyCanvasCommands(parsed, parsed.revision, [
    { type: "set_markdown", id: raw.blocks[0].id, source: "Updated" },
  ]);
  const renamed = applyCanvasCommands(edited, edited.revision, [
    { type: "rename_note", id: raw.notes[0].id, title: "Renamed" },
  ]);
  const expected = structuredClone(raw);
  expected.revision += 2;
  expected.blocks[0].source = "Updated";
  expected.notes[0].title = "Renamed";
  expect(parseCanvasDocument(JSON.stringify(renamed))).toEqual(expected);
  expect(raw.blocks[0].source).not.toBe("Updated");
});

it.each([
  ["unsafe key", JSON.parse('{"__proto__":{"polluted":true}}')],
  ["non-JSON value", { callback: () => {} }],
  ["non-finite value", { number: Infinity }],
  ["oversize value", "x".repeat(2 * 1024 * 1024)],
])("still rejects %s inside unknown fields", (_name, value) => {
  expect(() =>
    parseCanvasDocument({ ...createCanvasDocument(), future: value }),
  ).toThrow();
});

it("does not treat unknown fields as permission to relax known types or programs", () => {
  const raw: any = createCanvasDocument();
  raw.futureMetadata = true;
  raw.notes[0].title = 123;
  expect(() => parseCanvasDocument(raw)).toThrow();
  raw.notes[0].title = "OK";
  raw.blocks.find(
    (b: any) => b.type === "interactive",
  ).program.futureInstruction = "fetch";
  expect(() => parseCanvasDocument(raw)).toThrow();
});
