import {
  canvasShapeTextColor,
  type CanvasBlock,
  type CanvasCommand,
} from "@nomi/core";
import { ShapeGlyph } from "./ShapeGlyph";
export function CanvasShapeContent({
  block: b,
  editing = false,
  onEdit = () => {},
  endGroup = () => {},
}: {
  block: Extract<CanvasBlock, { type: "shape" }>;
  editing?: boolean;
  onEdit?: (commands: CanvasCommand[], group?: string) => void;
  endGroup?: () => void;
}) {
  const id = b.id;
  const s = b.shapeStyle ?? {},
    t = s.text ?? {};
  const textStyle = {
    fontSize: t.size ?? 14,
    fontWeight: t.bold ? 700 : 400,
    fontStyle: t.italic ? "italic" : undefined,
    textDecoration: [
      t.underline ? "underline" : "",
      t.strike ? "line-through" : "",
    ].join(" "),
    color: canvasShapeTextColor(s) ?? "var(--text)",
    textAlign: t.align ?? "center",
    transform: t.rotate ? "rotate(90deg)" : undefined,
  } as React.CSSProperties;
  const displayText =
    t.list === "bullet"
      ? b.text
          .split("\n")
          .map((v) => `• ${v}`)
          .join("\n")
      : t.list === "number"
        ? b.text
            .split("\n")
            .map((v, i) => `${i + 1}. ${v}`)
            .join("\n")
        : t.list === "quote"
          ? b.text
              .split("\n")
              .map((v) => `❝ ${v}`)
              .join("\n")
          : b.text;
  return (
    <div
      key={b.id}
      className={`canvas-shape-content shape-tone-${b.tone}`}
      style={{
        alignItems:
          t.verticalAlign === "top"
            ? "flex-start"
            : t.verticalAlign === "bottom"
              ? "flex-end"
              : "center",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          fill: s.fill ?? "var(--shape-fill)",
          fillOpacity: s.fillOpacity ?? 1,
          stroke: s.stroke ?? "var(--muted)",
          strokeOpacity: s.strokeOpacity ?? 1,
          strokeWidth: s.strokeWidth ?? 1.25,
          strokeDasharray:
            s.strokeStyle === "dashed"
              ? "8 6"
              : s.strokeStyle === "dotted"
                ? "1 5"
                : undefined,
        }}
      >
        <ShapeGlyph shape={b.shape} style={s} />
      </svg>
      {editing ? (
        <textarea
          data-shape-text={id}
          aria-label="形状文字"
          value={b.text}
          spellCheck={false}
          style={textStyle}
          onChange={(e) =>
            onEdit(
              [
                {
                  type: "set_shape",
                  block: { ...b, text: e.target.value },
                },
              ],
              b.id,
            )
          }
          onBlur={endGroup}
        />
      ) : (
        <span
          className={!b.text ? "is-placeholder" : undefined}
          style={textStyle}
        >
          {t.link && b.text ? (
            <a href={t.link} target="_blank" rel="noreferrer">
              {displayText}
            </a>
          ) : (
            displayText || "双击输入文字"
          )}
        </span>
      )}
    </div>
  );
}
