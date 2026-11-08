import { expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { emptyCanvasScene, temperatureProgram } from "@nomi/core";
import {
  noteAIContext,
  generatedNoteBlocks,
  reviseNoteGeneration,
} from "./noteAI";

it("captures bounded neighboring blocks and selected text, never other notes/assets", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "paragraph+" },
      paragraph: { content: "text*" },
      text: {},
    },
  });
  const text = schema.node("doc", null, [
    schema.node("paragraph", null, schema.text("before chosen after")),
  ]);
  const editor = { state: { doc: text } } as Editor;
  const scene = emptyCanvasScene("context");
  scene.blocks = [
    { id: "a", type: "markdown", source: "A".repeat(2000) },
    { id: "b", type: "markdown", source: "before chosen after" },
    { id: "c", type: "markdown", source: "B".repeat(2000) },
    { id: "private", type: "markdown", source: "OTHER NOTE" },
  ];
  const note = { id: "n", title: "Context title", blocks: ["a", "b", "c"] };
  scene.notes = [note, { id: "other", title: "Other", blocks: ["private"] }];
  const result = noteAIContext(
    scene,
    note,
    { block: scene.blocks[1] },
    editor,
    { from: 8, to: 14 },
  );
  expect(result).toMatchObject({ title: "Context title", selected: "chosen" });
  expect(result.before).toHaveLength(1500);
  expect(result.before.endsWith("before ")).toBe(true);
  expect(result.after).toHaveLength(1500);
  expect(result.after.startsWith(" after")).toBe(true);
  expect(JSON.stringify(result)).not.toContain("OTHER NOTE");
});
it("inserts live blocks directly with fresh IDs, without a canvas wrapper", () => {
  const scene = emptyCanvasScene("scene");
  scene.blocks = [
    { id: "prose", type: "markdown", source: "Generated" },
    { id: "lab", type: "interactive", program: temperatureProgram },
  ];
  const blocks = generatedNoteBlocks(scene);
  expect(blocks.map((b) => b.type)).toEqual(["markdown", "interactive"]);
  expect(blocks[0].id).not.toBe("prose");
  expect(blocks[1].id).not.toBe("lab");
  expect(blocks[1]).toMatchObject({ program: temperatureProgram });
  expect(generatedNoteBlocks(scene)[1].id).not.toBe(blocks[1].id);
  scene.blocks.push({
    id: "shape",
    type: "shape",
    shape: "rectangle",
    text: "Diagram",
    tone: "neutral",
  });
  expect(() => generatedNoteBlocks(scene)).toThrow(
    "文稿 AI 仅支持正文和交互块",
  );
});

it("revises the generated group atomically while preserving surrounding prose", () => {
  const document = emptyCanvasScene("revision");
  const before = {
    id: "before",
    type: "markdown" as const,
    source: "User text",
  };
  const generated = {
    id: "ai",
    type: "interactive" as const,
    program: temperatureProgram,
  };
  const after = {
    id: "after",
    type: "markdown" as const,
    source: "Still writing",
  };
  const next = { ...generated, id: "next" };
  document.blocks = [before, generated, after];
  document.notes = [
    { id: "n", title: "Test", blocks: [before.id, generated.id, after.id] },
  ];
  expect(reviseNoteGeneration(document, "n", [generated], [next])).toEqual([
    { type: "add_block", block: next },
    { type: "set_note_blocks", id: "n", blocks: ["before", "next", "after"] },
  ]);
  document.blocks[1] = {
    ...generated,
    program: { ...temperatureProgram, id: "user-edited" },
  };
  expect(() =>
    reviseNoteGeneration(document, "n", [generated], [next]),
  ).toThrow("插入位置");
  document.blocks[1] = generated;
  document.notes[0].blocks = ["before", "after"];
  expect(() =>
    reviseNoteGeneration(document, "n", [generated], [next]),
  ).toThrow("插入位置");
  document.notes[0].blocks = ["before", "ai", "after"];
  expect(() =>
    reviseNoteGeneration(document, "n", [before, generated], [next]),
  ).not.toThrow();
  document.notes[0].blocks = ["before", "after", "ai"];
  expect(() =>
    reviseNoteGeneration(document, "n", [before, generated], [next]),
  ).toThrow("插入位置");
});
