import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import {
  createCanvasDocument,
  applyCanvasCommands as applyCommands,
} from "@nomi/core";
import { insertAt, moveBlock, type TextSnapshot } from "./blockOperations";
import { nodePositions } from "./RichBlockFrame";
import type { Editor } from "@tiptap/core";
import { plainTextSlice } from "./clipboard";
const applyCanvasCommands = (
  doc: Parameters<typeof applyCommands>[0],
  commands: Parameters<typeof applyCommands>[2],
) => applyCommands(doc, doc.revision, commands);
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    text: {},
  },
});
function snapshot(lines: string[]): TextSnapshot {
  const doc = schema.node(
    "doc",
    null,
    lines.map((line) =>
      schema.node("paragraph", null, line ? schema.text(line) : undefined),
    ),
  );
  return {
    doc,
    serialize: (node) => {
      const out: string[] = [];
      node.forEach((child) => out.push(child.textContent));
      return out.join("\n\n");
    },
  };
}
function fixture() {
  const doc = createCanvasDocument();
  doc.blocks.push({
    id: "writing.text",
    type: "markdown",
    source: "A\n\nB\n\nC",
  });
  const note = doc.notes[0];
  note.blocks = ["writing.text", "interactive.temperature"];
  return {
    doc,
    note,
    snapshots: new Map([["writing.text", snapshot(["A", "B", "C"])]]),
  };
}
describe("writing block transactions", () => {
  it("replaces exactly the chosen blank paragraph when inserting an embed", () => {
    const { doc, note } = fixture();
    const state = snapshot(["A", "", "B"]);
    const snapshots = new Map([["writing.text", state]]);
    const embed = {
      id: "new.shape",
      type: "markdown" as const,
      source: "inserted",
    };
    const result = applyCanvasCommands(
      doc,
      insertAt(
        doc,
        note,
        { id: "writing.text", pos: 3, replaceTo: 5 },
        embed,
        snapshots,
      ),
    );
    const blocks = result.notes[0].blocks.map((id) =>
      result.blocks.find((b) => b.id === id),
    );
    expect(blocks.slice(0, 3)).toMatchObject([
      { source: "A" },
      { source: "inserted" },
      { source: "B" },
    ]);
    expect(() =>
      insertAt(
        doc,
        note,
        { id: "writing.text", pos: 0, replaceTo: 3 },
        embed,
        snapshots,
      ),
    ).toThrow("空行已改变");
  });

  it("replaces captured slash commands atomically and rejects changed command text", () => {
    const { doc, note } = fixture();
    const snapshots = new Map([
      ["writing.text", snapshot(["A", "/page", "B"])],
    ]);
    const point = {
      id: "writing.text",
      pos: 3,
      replaceTo: 10,
      replaceText: "/page",
    };
    const block = {
      id: "slash.ref",
      type: "note-reference" as const,
      documentId: doc.id,
      noteId: "missing.note",
      title: "Page",
    };
    const result = applyCanvasCommands(
      doc,
      insertAt(doc, note, point, block, snapshots),
    );
    expect(
      result.notes[0].blocks
        .slice(0, 3)
        .map((id) => result.blocks.find((b) => b.id === id)),
    ).toMatchObject([
      { source: "A" },
      { type: "note-reference" },
      { source: "B" },
    ]);
    expect(() =>
      insertAt(doc, note, { ...point, replaceText: "/note" }, block, snapshots),
    ).toThrow("文字已改变");
  });

  it("does not measure a destroyed editor while React is replacing its view", () => {
    const editor = {
      isDestroyed: true,
      get view() {
        throw Error("stale view");
      },
    } as unknown as Editor;
    expect(nodePositions(editor)).toEqual([]);
  });
  it("keeps plain-text blank and trailing lines", () => {
    const doc = snapshot([""]).doc;
    const slice = plainTextSlice("A\r\n\r\n\r\nB\n", doc.resolve(1), schema)!;
    expect(slice.content.childCount).toBe(5);
    expect(slice.content.child(1).textContent).toBe("");
    expect(slice.content.lastChild?.textContent).toBe("");
  });
  it("reorders a single paragraph without duplicating neighboring content", () => {
    const { doc, note, snapshots } = fixture();
    const commands = moveBlock(
      doc,
      note,
      { id: "writing.text", pos: 0, end: 3, revision: doc.revision },
      { id: "writing.text", pos: 9 },
      snapshots,
    );
    expect(commands).toEqual([
      { type: "set_markdown", id: "writing.text", source: "B\n\nC\n\nA" },
    ]);
  });
  it("moves an embed between paragraphs while retaining both halves and its identity", () => {
    const { doc, note, snapshots } = fixture();
    const commands = moveBlock(
      doc,
      note,
      { id: "interactive.temperature", revision: doc.revision },
      { id: "writing.text", pos: 3 },
      snapshots,
    );
    const result = applyCanvasCommands(doc, commands);
    const ids = result.notes[0].blocks;
    expect(ids.slice(0, 2)).toEqual([
      "writing.text",
      "interactive.temperature",
    ]);
    expect(result.blocks.find((b) => b.id === ids[0])).toMatchObject({
      source: "A",
    });
    expect(result.blocks.find((b) => b.id === ids[2])).toMatchObject({
      source: "B\n\nC",
    });
    expect(doc.notes[0].blocks).toHaveLength(2);
  });
  it("moves an embed one paragraph up or down while retaining the surrounding text", () => {
    for (const direction of [-1, 1]) {
      const { doc, note, snapshots } = fixture();
      if (direction > 0)
        note.blocks = ["interactive.temperature", "writing.text"];
      const result = applyCanvasCommands(
        doc,
        moveBlock(
          doc,
          note,
          { id: "interactive.temperature", revision: doc.revision },
          { id: "writing.text", pos: direction < 0 ? 6 : 3 },
          snapshots,
        ),
      );
      const visible = result.notes[0].blocks.flatMap((id) => {
        const block = result.blocks.find((b) => b.id === id)!;
        return block.type === "markdown" ? block.source.split("\n\n") : [id];
      });
      expect(visible).toEqual(
        direction < 0
          ? ["A", "B", "interactive.temperature", "C"]
          : ["A", "interactive.temperature", "B", "C"],
      );
      expect(
        result.notes[0].blocks.filter((id) => id === "interactive.temperature"),
      ).toHaveLength(1);
      expect(doc.blocks.find((b) => b.id === "writing.text")).toMatchObject({
        source: "A\n\nB\n\nC",
      });
    }
  });

  it("moves one paragraph across an embed atomically and rejects stale drags", () => {
    const { doc, note, snapshots } = fixture();
    const source = {
      id: "writing.text",
      pos: 3,
      end: 6,
      revision: doc.revision,
    };
    const result = applyCanvasCommands(
      doc,
      moveBlock(
        doc,
        note,
        source,
        { id: "interactive.temperature", after: true },
        snapshots,
      ),
    );
    expect(result.blocks.find((b) => b.id === "writing.text")).toMatchObject({
      source: "A\n\nC",
    });
    expect(
      result.blocks.find((b) => b.id === result.notes[0].blocks.at(-1)),
    ).toMatchObject({ source: "B" });
    expect(() =>
      moveBlock(
        result,
        result.notes[0],
        source,
        { id: "interactive.temperature" },
        snapshots,
      ),
    ).toThrow("已改变");
  });
  it("inserts at the beginning without creating an empty prefix, and drops on self do nothing", () => {
    const { doc, note, snapshots } = fixture();
    const result = applyCanvasCommands(
      doc,
      insertAt(
        doc,
        note,
        { id: "writing.text", pos: 0 },
        { id: "new.text", type: "markdown", source: "first" },
        snapshots,
      ),
    );
    expect(result.notes[0].blocks).toEqual([
      "new.text",
      "writing.text",
      "interactive.temperature",
    ]);
    expect(
      moveBlock(
        doc,
        note,
        { id: "writing.text", pos: 0, end: 3, revision: doc.revision },
        { id: "writing.text", pos: 3 },
        snapshots,
      ),
    ).toEqual([]);
  });
});
