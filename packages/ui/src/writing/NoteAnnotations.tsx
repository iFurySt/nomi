import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import type { NoteAnnotation } from "@nomi/core";

export function referenceExcerpt(a: NoteAnnotation) {
  if (a.kind === "text") return a.quote;
  const type = a.quote.match(/"type"\s*:\s*"([^"\n]+)"/)?.[1];
  return (
    (
      {
        interactive: "交互块",
        canvas: "画布",
        image: "图片",
        file: "附件",
        shape: "图形",
        "note-reference": "文稿引用",
      } as Record<string, string>
    )[type ?? ""] ?? a.quote.slice(0, 200)
  );
}

/** The comment is a local draft until Save; the note's text is never edited. */
export function NoteAnnotationEditor({
  annotation,
  number,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  annotation: NoteAnnotation;
  number: number;
  isNew: boolean;
  onSave: (comment: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [comment, setComment] = useState(annotation.comment);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-annotation-id="${CSS.escape(annotation.id)}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      setTarget(el);
    } else setTarget(document.querySelector(".note-annotations-trigger"));
  }, [annotation.id]);
  if (!target) return null;
  const reference =
    document.querySelector<HTMLElement>(
      `[data-annotation-range="${CSS.escape(annotation.id)}"]`,
    ) ?? target;
  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Popover.Anchor virtualRef={{ current: reference }} />
      <Popover.Portal>
        <Popover.Content
          className={"note-annotation-editor" + (isNew ? " is-new" : "")}
          side="top"
          align="start"
          sideOffset={12}
          collisionPadding={12}
          aria-label={`编辑批注 ${number}`}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (target.isConnected) target.focus({ preventScroll: true });
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave(comment.trim());
            }}
          >
            <textarea
              ref={input}
              aria-label={`批注 ${number}`}
              placeholder="添加批注…"
              value={comment}
              rows={isNew ? 1 : 2}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.nativeEvent.keyCode !== 229
                ) {
                  e.preventDefault();
                  onSave(comment.trim());
                }
              }}
            />
            {isNew ? (
              <button
                type="submit"
                className="annotation-confirm"
                aria-label="确认批注"
              >
                <Check size={18} />
              </button>
            ) : (
              <div className="annotation-editor-actions">
                <button
                  type="button"
                  className="annotation-icon"
                  aria-label={`删除批注 ${number}`}
                  onClick={onDelete}
                >
                  <Trash2 size={17} />
                </button>
                <span />
                <button type="button" onClick={onCancel}>
                  取消
                </button>
                <button type="submit" className="annotation-save">
                  保存
                </button>
              </div>
            )}
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function NoteAnnotationChip({
  annotations,
  disabled,
  onEdit,
  onRemove,
  onClear,
}: {
  annotations: NoteAnnotation[];
  disabled: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepOpen = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!annotations.length) return null;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className="note-annotations-anchor">
          <div
            className="note-annotations-chip"
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") keepOpen();
            }}
            onPointerLeave={leave}
          >
            <button
              type="button"
              className="note-annotations-trigger"
              aria-label={`查看 ${annotations.length} 条批注`}
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={keepOpen}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  keepOpen();
                }
              }}
            >
              <MessageSquare size={14} />
              {annotations.length} 条批注
            </button>

            <button
              type="button"
              className="annotation-clear"
              aria-label="清空批注"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onClear();
              }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="note-annotations-popover"
          aria-label="待发送批注"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={keepOpen}
          onPointerLeave={leave}
          onFocusCapture={keepOpen}
        >
          {annotations.map((a, i) => (
            <div className="note-chat-annotation" key={a.id}>
              <span className="annotation-list-number">{i + 1}.</span>
              <div className="annotation-list-content">
                <span className="annotation-label">
                  {a.kind === "text" ? "选中文字" : "内容块"}
                </span>
                <blockquote>{referenceExcerpt(a)}</blockquote>
                <span className="annotation-label">批注</span>
                <p>{a.comment || "未添加说明"}</p>
              </div>
              <div className="annotation-list-actions">
                <button
                  className="annotation-icon"
                  type="button"
                  aria-label={`编辑批注 ${i + 1}`}
                  disabled={disabled}
                  onClick={() => {
                    setOpen(false);
                    onEdit(a.id);
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="annotation-icon"
                  type="button"
                  aria-label={`移除批注 ${i + 1}`}
                  disabled={disabled}
                  onClick={() => onRemove(a.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
