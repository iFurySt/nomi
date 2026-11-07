import { describe, it, expect } from "vitest";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { WritingTable, readTableWidths } from "./WritingTable";

const manager = () =>
  new MarkdownManager({
    extensions: [
      StarterKit,
      TableKit.configure({ table: false }),
      WritingTable,
    ],
  });
describe("table column layout persistence", () => {
  it("round-trips column widths with ordinary GFM cell contents", () => {
    const md = manager();
    const source =
      "<!-- nomi-table-widths: [180,320] -->\n| Symbol | Meaning |\n| --- | --- |\n| Q | Query |";
    const doc = md.parse(source);
    expect(doc.content?.[0].type).toBe("table");
    expect(
      doc.content?.[0].content?.[1].content?.map((c) => c.attrs?.colwidth),
    ).toEqual([[180], [320]]);
    const saved = md.serialize(doc);
    expect(saved).toContain("<!-- nomi-table-widths: [180,320] -->");
    expect(md.parse(saved)).toEqual(doc);
  });
  it("leaves legacy tables without metadata", () => {
    const md = manager();
    expect(
      md.serialize(md.parse("| A | B |\n| --- | --- |\n| 1 | 2 |")),
    ).not.toContain("nomi-table-widths");
  });
  it("accepts missing widths and rejects unsafe dimensions", () => {
    expect(readTableWidths("<!-- nomi-table-widths: [null,120] -->\n")).toEqual(
      [null, 120],
    );
    expect(
      readTableWidths("<!-- nomi-table-widths: [0,999999] -->\n"),
    ).toBeUndefined();
  });
});
