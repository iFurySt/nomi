import { Table } from "@tiptap/extension-table";
import type { JSONContent } from "@tiptap/core";

// GFM remains readable elsewhere; the optional comment stores only layout.
export const tableWidthComment =
  /^<!-- nomi-table-widths: (\[(?:null|\d+)(?:,(?:null|\d+))*\]) -->\r?\n/;
export function readTableWidths(source: string): (number | null)[] | undefined {
  const match = tableWidthComment.exec(source);
  if (!match) return;
  const widths: (number | null)[] = JSON.parse(match[1]);
  if (
    widths.length > 200 ||
    widths.some((w) => w !== null && (w < 48 || w > 4000))
  )
    return;
  return widths;
}
export function tableWidths(node: JSONContent): (number | null)[] {
  return (node.content?.[0]?.content ?? []).flatMap((cell) =>
    Array.from(
      { length: cell.attrs?.colspan ?? 1 },
      (_, i) => cell.attrs?.colwidth?.[i] ?? null,
    ),
  );
}
export const WritingTable = Table.extend({
  parseMarkdown(token, helpers) {
    const node = this.parent!(token, helpers) as JSONContent;
    const widths = token.nomiWidths as (number | null)[] | undefined;
    if (widths && node.content?.[0]?.content?.length === widths.length) {
      for (const row of node.content ?? []) {
        row.content?.forEach((cell, i) => {
          if (widths[i]) cell.attrs = { ...cell.attrs, colwidth: [widths[i]] };
        });
      }
    }
    return node;
  },
  renderMarkdown(node, helpers, context) {
    const source = this.parent!(node, helpers, context);
    const widths = tableWidths(node);
    return widths.some(Boolean)
      ? `<!-- nomi-table-widths: ${JSON.stringify(widths)} -->\n${source.trimStart()}`
      : source;
  },
  markdownTokenizer: {
    ...Table.config.markdownTokenizer!,
    name: "table",
    level: "block",
    start(source) {
      if (readTableWidths(source)) return 0;
      const start = Table.config.markdownTokenizer!.start;
      return typeof start === "function"
        ? start(source)
        : source.indexOf(start ?? "|");
    },
    tokenize(source, tokens, helper) {
      const widths = readTableWidths(source);
      if (widths) {
        const prefix = tableWidthComment.exec(source)![0];
        const table = helper.blockTokens(source.slice(prefix.length))[0];
        if (table?.type === "table")
          return { ...table, raw: prefix + table.raw, nomiWidths: widths };
      }
      return Table.config.markdownTokenizer!.tokenize(source, tokens, helper);
    },
  },
});
