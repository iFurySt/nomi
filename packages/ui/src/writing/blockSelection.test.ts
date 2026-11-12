import { expect, it } from "vitest";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { createCanvasDocument, applyCanvasCommands } from "@nomi/core";
import {
  deleteSelected,
  encodeSelected,
  decodeSelected,
} from "./blockSelection";
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    text: {},
  },
});
const snapshot = {
  doc: schema.node(
    "doc",
    null,
    ["first", "second", "third"].map((s) =>
      schema.node("paragraph", null, schema.text(s)),
    ),
  ),
  serialize(node: PMNode): string {
    const lines: string[] = [];
    node.forEach((n) => lines.push(n.textContent));
    return lines.join("\n\n");
  },
};
function fixture() {
  const doc = createCanvasDocument();
  doc.blocks.push({
    id: "text.test",
    type: "markdown",
    source: "first\n\nsecond\n\nthird",
  });
  doc.notes[0].blocks = ["text.test", "interactive.temperature"];
  return doc;
}
it("deletes only intersected paragraphs and detaches embeds without deleting shared content", () => {
  const doc = fixture();
  const result = applyCanvasCommands(
    doc,
    doc.revision,
    deleteSelected(doc, doc.notes[0], [
      { id: "text.test", from: 7, to: 15, snapshot },
      { id: "interactive.temperature" },
    ]),
  );
  expect(result.notes[0].blocks).toEqual(["text.test"]);
  expect(result.blocks.find((b) => b.id === "text.test")).toMatchObject({
    source: "first\n\nthird",
  });
  expect(result.blocks.some((b) => b.id === "interactive.temperature")).toBe(
    true,
  );
});
it("round trips mixed content with fresh IDs and the original interactive program", () => {
  const doc = fixture();
  const copy = encodeSelected(doc, [
    { id: "text.test", from: 7, to: 15, snapshot },
    { id: "interactive.temperature" },
  ]);
  const blocks = decodeSelected(copy.payload, doc);
  expect(blocks[0]).toMatchObject({ source: "second" });
  expect(blocks[0].id).not.toBe("text.test");
  expect(blocks[1]).toMatchObject({
    type: "interactive",
    program: doc.blocks.find((b) => b.type === "interactive")!.program,
  });
  expect(copy.plain).toContain("second");
});
it("removes fully selected text from the note while keeping its source available for undo", () => {
  const doc = fixture();
  const result = applyCanvasCommands(
    doc,
    doc.revision,
    deleteSelected(doc, doc.notes[0], [{ id: "text.test" }]),
  );
  expect(result.notes[0].blocks).toEqual(["interactive.temperature"]);
  expect(result.blocks.find((b) => b.id === "text.test")).toMatchObject({
    source: "first\n\nsecond\n\nthird",
  });
});
it("rejects malformed clipboard payloads", () => {
  expect(() =>
    decodeSelected('{"schema":"nomi-blocks/v1","document":{}}', fixture()),
  ).toThrow();
});
