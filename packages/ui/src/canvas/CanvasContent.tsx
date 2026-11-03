import { useId } from "react";
import { Paperclip, ImagePlus, FlaskConical } from "lucide-react";
import type { CanvasDocument, CanvasCommand, CanvasNote } from "@nomi/core";
import type { CanvasRepository } from "@nomi/platform";
import { AssetContent } from "./AssetContent";
export { AssetContent } from "./AssetContent";
import { Markdown } from "./Markdown";
import { InteractiveBlock } from "./InteractiveBlock";
import { NoteReference } from "../writing/NoteLink";
import { CanvasShapeContent } from "./CanvasShapeContent";
import { DrawingSurface } from "../writing/DrawingSurface";
import { EmbeddedCanvasBlock } from "./EmbeddedCanvasBlock";
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
    if (b.type === "canvas")
      return <EmbeddedCanvasBlock key={id} block={b} profile={profile} />;
    if (b.type === "drawing") return <DrawingSurface key={id} block={b} />;
    if (b.type === "note-reference")
      return (
        <NoteReference
          key={id}
          block={b}
          document={document}
          repository={repository}
        />
      );
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
    if (b.type === "shape")
      return (
        <CanvasShapeContent
          key={id}
          block={b}
          editing={editing}
          onEdit={onEdit}
          endGroup={endGroup}
        />
      );
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
