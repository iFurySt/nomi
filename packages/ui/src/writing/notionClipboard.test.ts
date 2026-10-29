import { describe, expect, it } from "vitest";
import { Fragment, Schema, Slice } from "@tiptap/pm/model";
import { restoreNotionBlanks } from "./notionClipboard";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: {},
    bulletList: { group: "block", content: "listItem+" },
    orderedList: {
      group: "block",
      content: "listItem+",
      attrs: { start: { default: 1 } },
    },
    listItem: { content: "paragraph block*" },
  },
  marks: { bold: {}, link: { attrs: { href: {} } } },
});
const paragraph = (text = "") =>
  schema.node("paragraph", null, text ? schema.text(text) : undefined);
const clipboard = (rows: [string, string][]) =>
  JSON.stringify({
    blocks: rows.map(([type, text], i) => ({
      blockId: String(i),
      blockSubtree: {
        __version__: 3,
        block: {
          [i]: {
            value: {
              type,
              alive: true,
              ...(text ? { properties: { title: [[text]] } } : {}),
            },
          },
        },
      },
    })),
  });
const slice = (...nodes: ReturnType<typeof paragraph>[]) =>
  Slice.maxOpen(Fragment.fromArray(nodes));

describe("Notion clipboard blank blocks", () => {
  it("restores leading, consecutive and trailing blanks while reusing rich nodes", () => {
    const rich = schema.node(
      "paragraph",
      null,
      schema.text("A", [
        schema.mark("bold"),
        schema.mark("link", { href: "https://example.com" }),
      ]),
    );
    const result = restoreNotionBlanks(
      clipboard([
        ["text", ""],
        ["text", "A"],
        ["text", ""],
        ["text", ""],
        ["text", "B"],
        ["text", ""],
      ]),
      slice(rich, paragraph("B")),
      schema,
    )!;
    const nodes = Array.from({ length: result.content.childCount }, (_, i) =>
      result.content.child(i),
    );
    expect(nodes.map((node) => node.textContent)).toEqual([
      "",
      "A",
      "",
      "",
      "B",
      "",
    ]);
    expect(nodes[1]).toBe(rich);
    expect(nodes[1].firstChild?.marks.map((mark) => mark.type.name)).toEqual([
      "bold",
      "link",
    ]);
  });

  it("keeps lists grouped and splits numbered lists around explicit blank blocks", () => {
    const list = schema.node(
      "orderedList",
      { start: 3 },
      ["A", "B", "C"].map((text) =>
        schema.node("listItem", null, paragraph(text)),
      ),
    );
    const result = restoreNotionBlanks(
      clipboard([
        ["numbered_list", "A"],
        ["numbered_list", "B"],
        ["text", ""],
        ["numbered_list", "C"],
      ]),
      slice(list),
      schema,
    )!;
    expect(result.content.childCount).toBe(3);
    expect(result.content.child(0).childCount).toBe(2);
    expect(result.content.child(2).attrs.start).toBe(5);
  });

  it("restores an entirely blank selection", () => {
    expect(
      restoreNotionBlanks(
        clipboard([
          ["text", ""],
          ["text", ""],
        ]),
        Slice.empty,
        schema,
      )?.content.childCount,
    ).toBe(2);
  });

  it("falls back for mismatching, partial, unsupported, malformed and already blank input", () => {
    const source = clipboard([
      ["text", "A"],
      ["text", ""],
      ["text", "B"],
    ]);
    for (const raw of [
      "{",
      "null",
      '{"blocks":[null]}',
      clipboard([
        ["table", "A"],
        ["text", ""],
      ]),
    ])
      expect(
        restoreNotionBlanks(raw, slice(paragraph("A")), schema),
      ).toBeNull();
    for (const incoming of [
      slice(paragraph("A")),
      slice(paragraph("partial"), paragraph("B")),
      slice(paragraph("A"), paragraph(), paragraph("B")),
    ])
      expect(restoreNotionBlanks(source, incoming, schema)).toBeNull();
    const nested = JSON.parse(source);
    nested.blocks[0].blockSubtree.block[0].value.content = ["child"];
    expect(
      restoreNotionBlanks(
        JSON.stringify(nested),
        slice(paragraph("A"), paragraph("B")),
        schema,
      ),
    ).toBeNull();
  });
});
