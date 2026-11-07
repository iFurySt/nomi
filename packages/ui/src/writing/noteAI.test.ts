import { expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { emptyCanvasScene } from "@nomi/core";
import { noteAIContext, generatedNoteBlocks } from "./noteAI";

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
it("keeps diagram identities together but creates fresh IDs for prose", () => {
  const scene = emptyCanvasScene("scene");
  scene.blocks = [{ id: "prose", type: "markdown", source: "Generated" }];
  const first = generatedNoteBlocks(scene)[0];
  expect(first.type).toBe("markdown");
  expect(first.id).not.toBe("prose");
  scene.blocks.push({
    id: "shape",
    type: "shape",
    shape: "rectangle",
    text: "Diagram",
    tone: "neutral",
  });
  const diagram = generatedNoteBlocks(scene)[0];
  expect(diagram.type).toBe("canvas");
  if (diagram.type === "canvas") expect(diagram.scene).toEqual(scene);
});
