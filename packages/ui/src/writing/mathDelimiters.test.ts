import { describe, expect, it } from "vitest";
import { Fragment, Schema, Slice } from "@tiptap/pm/model";
import { tableNodes } from "@tiptap/pm/tables";
import {
  mathTextParts,
  normalizeMathMarkdown,
  unwrapMath,
} from "./mathDelimiters";
import { recognizePastedMath } from "./clipboard";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    codeBlock: { content: "text*", group: "block", code: true },
    inlineMath: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { latex: {} },
    },
    ...tableNodes({
      tableGroup: "block",
      cellContent: "paragraph+",
      cellAttributes: {},
    }),
  },
  marks: { code: { code: true }, bold: {} },
});

describe("math delimiter compatibility", () => {
  it("accepts wrappers in the formula editor without consuming multiple equations", () => {
    for (const source of [
      String.raw`\(V\)`,
      String.raw`\[V\]`,
      "$V$",
      "$$V$$",
      "V",
    ])
      expect(unwrapMath(source)).toBe("V");
    expect(unwrapMath(String.raw`\(a\) + \(b\)`)).toBe(
      String.raw`\(a\) + \(b\)`,
    );
    expect(unwrapMath(String.raw`\(V`)).toBe(String.raw`\(V`);
  });
  it("recognizes table symbols and standalone display math while protecting examples", () => {
    expect(normalizeMathMarkdown(String.raw`| \(H_{kv}\) | \[d_h\] |`)).toBe(
      "| $H_{kv}$ | $d_h$ |",
    );
    expect(normalizeMathMarkdown(String.raw`\[x^2\]`)).toBe("$$\nx^2\n$$");
    for (const source of [
      "`\\(V\\)`",
      "```tex\n\\(V\\)\n```",
      "```tex\n\\(V\\)",
      String.raw`\\(V\\)`,
      String.raw`$\text{\(V\)}$`,
    ])
      expect(normalizeMathMarkdown(source)).toBe(source);
  });
  it("preserves incomplete/invalid input and does not guess plain letters or currency", () => {
    for (const source of [
      "V",
      "151,936",
      "Costs $5 and $6",
      String.raw`\(V`,
      String.raw`\(\notARealCommand\)`,
    ])
      expect(mathTextParts(source)).toEqual([{ text: source }]);
    expect(mathTextParts(String.raw`值 \(V\)，$H_q$`)).toEqual([
      { text: "值 " },
      { text: String.raw`\(V\)`, latex: "V" },
      { text: "，" },
      { text: "$H_q$", latex: "H_q" },
    ]);
  });
  it("converts pasted table cells to editable math and preserves structure, marks and code", () => {
    const p = (text: string, code = false) =>
      schema.node(
        "paragraph",
        null,
        schema.text(text, [schema.mark(code ? "code" : "bold")]),
      );
    const table = schema.node("table", null, [
      schema.node("table_row", null, [
        schema.node("table_cell", null, p(String.raw`\(V\)`)),
        schema.node("table_cell", null, p(String.raw`\(D\)`, true)),
      ]),
    ]);
    const input = new Slice(
      Fragment.fromArray([
        table,
        schema.node("codeBlock", null, schema.text(String.raw`\(H\)`)),
      ]),
      0,
      0,
    );
    const result = recognizePastedMath(input, schema);
    const cell = result.content.firstChild!.firstChild!.firstChild!.firstChild!;
    expect(cell.firstChild!.type.name).toBe("inlineMath");
    expect(cell.firstChild!.attrs.latex).toBe("V");
    expect(cell.firstChild!.marks[0].type.name).toBe("bold");
    expect(result.content.firstChild!.firstChild!.lastChild!.textContent).toBe(
      String.raw`\(D\)`,
    );
    expect(result.content.lastChild!.textContent).toBe(String.raw`\(H\)`);
    expect(recognizePastedMath(result, schema).toJSON()).toEqual(
      result.toJSON(),
    );
  });
});
