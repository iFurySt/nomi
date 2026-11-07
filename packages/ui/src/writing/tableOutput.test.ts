import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { tableNodes } from "@tiptap/pm/tables";
import { tableRows, delimitedTable } from "./tableOutput";
import { readMathSource, writeMathSource } from "./mathSource";
import { needsSourceEditor } from "./RichMarkdownEditor";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: {},
    paragraph: { content: "text*", group: "block" },
    ...tableNodes({
      tableGroup: "block",
      cellContent: "paragraph+",
      cellAttributes: {},
    }),
  },
});
const p = (text: string) =>
  schema.node("paragraph", null, text ? schema.text(text) : undefined);
describe("table text output", () => {
  it("only allows valid layout comments immediately before a table", () => {
    const prefix = "<!-- nomi-table-widths: [180,320] -->\n";
    expect(
      needsSourceEditor(prefix + "| A | B |\n| --- | --- |\n| 1 | 2 |"),
    ).toBe(false);
    expect(needsSourceEditor(prefix + "ordinary paragraph")).toBe(true);
    expect(
      needsSourceEditor(
        "<!-- nomi-table-widths: [999999] -->\n| A |\n| --- |\n| 1 |",
      ),
    ).toBe(true);
  });
  it("keeps only plain table line breaks editable, preserving protection for other HTML", () => {
    expect(
      needsSourceEditor("| A | B |\n| --- | --- |\n| one<br>two | text |"),
    ).toBe(false);
    expect(needsSourceEditor("outside<br>table")).toBe(true);
    expect(
      needsSourceEditor(
        '| A | B |\n| --- | --- |\n| <br onclick="x()"> | text |',
      ),
    ).toBe(true);
  });
  it("quotes separators, newlines and quotes without losing Chinese or empty cells", () => {
    const rows = [
      ["名字", "备注", ""],
      ["A,B", '说"你好"', "第一行\n第二行"],
    ];
    expect(delimitedTable(rows, ",")).toBe(
      '名字,备注,\r\n"A,B","说""你好""","第一行\n第二行"',
    );
    expect(delimitedTable([["a\tb", "c"]], "\t")).toBe('"a\tb"\tc');
  });
  it("retains a rectangular grid for merged cells and paragraph breaks", () => {
    const table = schema.node("table", null, [
      schema.node("table_row", null, [
        schema.node("table_header", { colspan: 2 }, p("标题")),
      ]),
      schema.node("table_row", null, [
        schema.node("table_cell", null, [p("第一段"), p("第二段")]),
        schema.node("table_cell", null, p("值")),
      ]),
    ]);
    expect(tableRows(table)).toEqual([
      ["标题", ""],
      ["第一段\n第二段", "值"],
    ]);
  });
});
describe("formula layout in Markdown", () => {
  it("round trips alignment without changing LaTeX or accumulating metadata", () => {
    const latex = "\\begin{aligned}\na&=b\\\\\nc&=d\n\\end{aligned}";
    const source = writeMathSource(latex, "right");
    expect(readMathSource(source)).toEqual({ latex, alignment: "right" });
    expect(readMathSource(writeMathSource(source, "center"))).toEqual({
      latex,
      alignment: "center",
    });
    expect(writeMathSource(source, "left")).toBe(latex);
    expect(readMathSource(latex).alignment).toBe("left");
    expect(readMathSource(writeMathSource(source, "left"))).toEqual({
      latex,
      alignment: "left",
    });
    expect(readMathSource("% ordinary LaTeX comment\nx^2").latex).toBe(
      "% ordinary LaTeX comment\nx^2",
    );
  });
});
