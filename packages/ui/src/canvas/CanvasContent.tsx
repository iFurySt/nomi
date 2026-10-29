import { canvasShapeTextColor } from "@nomi/core";
import { useId } from "react";
import { Paperclip, ImagePlus, FlaskConical } from "lucide-react";
import type {
  CanvasDocument,
  CanvasCommand,
  CanvasNote,
} from "@nomi/core";
import type { CanvasRepository } from "@nomi/platform";
import { AssetContent } from "./AssetContent";
export { AssetContent } from "./AssetContent";
import { Markdown } from "./Markdown";
import { InteractiveBlock } from "./InteractiveBlock";
import { ShapeGlyph } from "./ShapeGlyph";
export function CanvasContent({
  document,
  contentId,
  profile,
  repository,
  editing,
  onEdit,
  onAttach,
  onInteractive,
  endGroup,
}: {
  document: CanvasDocument;
  contentId: string;
  profile: string;
  repository: CanvasRepository;
  editing: boolean;
  onEdit: (commands: CanvasCommand[], group?: string) => void;
  onAttach: (noteId: string) => void;
  onInteractive: (noteId: string) => void;
  endGroup: () => void;
}) {
  const prefix = useId();
  const block = (id: string) => {
    const b = document.blocks.find((b) => b.id === id)!;
    if (b.type === "markdown")
      return editing ? (
        <div key={id} className="canvas-source-block">
          <label htmlFor={`${prefix}-${id}`}>Markdown / LaTeX</label>
          <textarea
            id={`${prefix}-${id}`}
            data-markdown={id}
            value={b.source}
            spellCheck={false}
            onChange={(e) =>
              onEdit([{ type: "set_markdown", id, source: e.target.value }], id)
            }
            onBlur={endGroup}
          />
        </div>
      ) : (
        <Markdown key={id} source={b.source} />
      );
    if (b.type === "interactive")
      return (
        <InteractiveBlock
          key={id}
          program={b.program}
          profile={profile}
          documentId={document.id}
          blockId={b.id}
        />
      );
    if (b.type === "shape") {
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
          key={id}
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
    return (
      <AssetContent
        key={id}
        block={b}
        onCaptionChange={
          editing && b.type === "image"
            ? (caption) =>
                onEdit(
                  [{ type: "set_image_caption", id: b.id, caption }],
                  `caption:${b.id}`,
                )
            : undefined
        }
        onCaptionBlur={endGroup}
        document={document}
        repository={repository}
      />
    );
  };
  const note = document.notes.find((n) => n.id === contentId);
  return (
    <div
      className={`canvas-content ${editing ? "is-editing" : ""}`}
      data-canvas-scroll
    >
      {note ? (
        <>
          {note.blocks.map(block)}
          {editing && (
            <div className="canvas-note-inserts">
              <button onClick={() => onAttach(note.id)}>
                <ImagePlus size={14} />
                <Paperclip size={14} /> 图片或文件
              </button>
              <button onClick={() => onInteractive(note.id)}>
                <FlaskConical size={14} /> 交互块
              </button>
            </div>
          )}
        </>
      ) : (
        block(contentId)
      )}
    </div>
  );
}
export function NoteTitle({
  note,
  onEdit,
  endGroup,
}: {
  note: CanvasNote;
  onEdit: (commands: CanvasCommand[], group?: string) => void;
  endGroup: () => void;
}) {
  return (
    <input
      className="canvas-note-title-input"
      aria-label="笔记标题"
      title="编辑标题（可选）"
      value={note.title}
      maxLength={200}
      placeholder="添加标题"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.blur();
        }
      }}
      onChange={(e) =>
        onEdit(
          [{ type: "rename_note", id: note.id, title: e.target.value }],
          note.id,
        )
      }
      onBlur={endGroup}
    />
  );
}
