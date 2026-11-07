import type { Node } from "@tiptap/pm/model";
import { mathClipboardText } from "./mathClipboard";
import { TableMap } from "@tiptap/pm/tables";

export function tableRows(table: Node): string[][] {
  const map = TableMap.get(table);
  const seen = new Set<number>();
  return Array.from({ length: map.height }, (_, row) =>
    Array.from({ length: map.width }, (_, column) => {
      const pos = map.map[row * map.width + column];
      if (seen.has(pos)) return "";
      seen.add(pos);
      const cell = table.nodeAt(pos);
      return cell ? mathClipboardText(cell.content, "\n") : "";
    }),
  );
}
export function delimitedTable(rows: string[][], separator: "," | "\t") {
  return rows
    .map((row) =>
      row
        .map((value) =>
          value.includes(separator) || /["\r\n]/.test(value)
            ? `"${value.replaceAll('"', '""')}"`
            : value,
        )
        .join(separator),
    )
    .join("\r\n");
}
export function downloadTable(table: Node) {
  const url = URL.createObjectURL(
    new Blob(["\ufeff", delimitedTable(tableRows(table), ",")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "table.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
