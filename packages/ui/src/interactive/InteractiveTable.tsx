import { useState } from "react";

type TokenCell = {
  tokens: string[];
  emphasis?: number[];
  groups?: number[][];
  joiners?: string[];
};
type Cell = string | number | TokenCell;

function Tokens({ cell }: { cell: TokenCell }) {
  const covered = new Set(cell.groups?.flat());
  const token = (index: number) => (
    <span
      key={index}
      className="learning-token"
      data-emphasis={cell.emphasis?.includes(index) || undefined}
      title={cell.tokens[index]}
    >
      {cell.tokens[index].replaceAll("</w>", "▁")}
    </span>
  );
  return (
    <span className="learning-tokens">
      {cell.tokens.map((_, index) => {
        const group = cell.groups?.find((g) => g[0] === index);
        if (!group && covered.has(index)) return null;
        return (
          <span className="learning-token-part" key={index}>
            {index > 0 && cell.joiners && (
              <span className="learning-token-joiner">
                {cell.joiners[index - 1]}
              </span>
            )}
            {group ? (
              <span className="learning-token-group">{group.map(token)}</span>
            ) : (
              token(index)
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Semantic data presentation; expansion is view-local and never truncates the DSL. */
export function InteractiveTable({
  id,
  columns,
  rows,
  caption,
  hint,
  showCount = true,
  columnAlign,
  emptyText = "—",
  visibleRows,
  window: edge = "start",
  highlightRow = -1,
}: {
  id: string;
  columns: string[];
  rows: Cell[][];
  caption?: string;
  hint?: string;
  showCount?: boolean;
  columnAlign?: ("left" | "right")[];
  emptyText?: string;
  visibleRows?: number;
  window?: "start" | "end";
  highlightRow?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = visibleRows ?? rows.length;
  const start =
    !expanded && edge === "end" ? Math.max(0, rows.length - limit) : 0;
  const displayed = expanded ? rows : rows.slice(start, start + limit);
  const expandable = rows.length > limit;
  const align = (i: number) =>
    columnAlign?.[i] ??
    (rows.length && rows.every((r) => typeof r[i] === "number")
      ? "right"
      : "left");
  return (
    <section className="learning-data" data-node={id}>
      {caption && (
        <div className="learning-table-heading">
          <span>
            {caption}
            {showCount && rows.length > 0 && <small>{rows.length}</small>}
          </span>
          {hint && <small>{hint}</small>}
        </div>
      )}
      <div
        className="learning-table"
        tabIndex={0}
        role="region"
        aria-label={caption ?? columns.join(" / ")}
      >
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  scope="col"
                  key={i}
                  data-align={align(i)}
                  data-numeric={
                    (rows.length > 0 &&
                      rows.every((r) => typeof r[i] === "number")) ||
                    undefined
                  }
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row, i) => (
              <tr
                key={start + i}
                data-emphasis={start + i === highlightRow || undefined}
              >
                {row.map((cell, j) => (
                  <td key={j} data-align={align(j)}>
                    {typeof cell === "object" ? <Tokens cell={cell} /> : cell}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length} className="learning-table-empty">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {expandable && (
        <button
          className="learning-table-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "收起" : `展开全部 ${rows.length} 项`}
        </button>
      )}
    </section>
  );
}
