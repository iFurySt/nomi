import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  RemoveFormatting,
  Sigma,
} from "lucide-react";
export type TextFormat =
  "bold" | "italic" | "strike" | "code" | "clear" | "link" | "formula";
export type TextRange = { from: number; to: number };
export const textFormats = [
  ["bold", "粗体", Bold],
  ["italic", "斜体", Italic],
  ["strike", "删除线", Strikethrough],
  ["code", "行内代码", Code],
  ["link", "链接", Link],
  ["clear", "清除格式", RemoveFormatting],
] as const;
export function formatText(
  editor: Editor,
  format: TextFormat,
  range: TextRange,
) {
  if (editor.isDestroyed) return;
  const chain = editor.chain().focus().setTextSelection(range);
  if (format === "bold") chain.toggleBold().run();
  else if (format === "italic") chain.toggleItalic().run();
  else if (format === "strike") chain.toggleStrike().run();
  else if (format === "code") chain.toggleCode().run();
  else if (format === "clear") chain.unsetAllMarks().run();
}
export function SelectionToolbar({
  editor,
  onFormat,
  disabled,
}: {
  editor: Editor;
  onFormat: (format: TextFormat, range: TextRange) => void;
  disabled: boolean;
}) {
  const toolbar = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ rect: DOMRect; range: TextRange }>();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const suppressed = useRef("");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
    }),
  });
  useEffect(() => {
    let frame = 0,
      selecting = false,
      measure = false;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          editor.isDestroyed ||
          disabled ||
          editor.view.composing ||
          selecting
        ) {
          setAnchor(undefined);
          return;
        }
        const selection = editor.state.selection;
        const key = `${selection.from}:${selection.to}`;
        if (suppressed.current && suppressed.current !== key)
          suppressed.current = "";
        const active = document.activeElement;
        if (
          !(selection instanceof TextSelection) ||
          selection.empty ||
          suppressed.current === key ||
          !editor.state.doc.textBetween(selection.from, selection.to).trim() ||
          !(
            editor.view.dom.contains(active) ||
            toolbar.current?.contains(active)
          )
        ) {
          setAnchor(undefined);
          return;
        }
        const dom = window.getSelection();
        if (
          !dom?.rangeCount ||
          !editor.view.dom.contains(dom.anchorNode) ||
          !editor.view.dom.contains(dom.focusNode)
        ) {
          setAnchor(undefined);
          return;
        }
        const range = dom.getRangeAt(0),
          rects = range.getClientRects();
        const scroll = editor.view.dom
          .closest(".notes-scroll")
          ?.getBoundingClientRect();
        const rect = [...rects].find(
          (r) =>
            r.bottom > Math.max(0, scroll?.top ?? 0) &&
            r.top < Math.min(innerHeight, scroll?.bottom ?? innerHeight),
        );
        if (!rect) {
          setAnchor(undefined);
          return;
        }
        const reposition = measure;
        measure = false;
        setAnchor((previous) =>
          previous &&
          !reposition &&
          previous.range.from === selection.from &&
          previous.range.to === selection.to
            ? previous
            : { rect, range: { from: selection.from, to: selection.to } },
        );
      });
    };
    // Marks can split DOM ranges and change font metrics. Keep the popup still
    // for the same selection; only viewport movement needs fresh geometry.
    const move = () => {
      measure = true;
      refresh();
    };
    const down = (event: PointerEvent) => {
      if (toolbar.current?.contains(event.target as Node)) return;
      selecting = true;
      setAnchor(undefined);
      suppressed.current = "";
    };
    const up = () => {
      selecting = false;
      refresh();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        suppressed.current = `${editor.state.selection.from}:${editor.state.selection.to}`;
        setAnchor(undefined);
        if (toolbar.current?.contains(document.activeElement))
          editor.commands.focus();
      }
    };
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    editor.on("focus", refresh);
    editor.on("blur", refresh);
    document.addEventListener("selectionchange", refresh);
    document.addEventListener("compositionstart", refresh);
    document.addEventListener("compositionend", refresh);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    refresh();
    return () => {
      cancelAnimationFrame(frame);
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
      editor.off("focus", refresh);
      editor.off("blur", refresh);
      document.removeEventListener("selectionchange", refresh);
      document.removeEventListener("compositionstart", refresh);
      document.removeEventListener("compositionend", refresh);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", move);
    };
  }, [editor, disabled]);
  useLayoutEffect(() => {
    if (!anchor || !toolbar.current) return;
    const update = () => {
      if (!toolbar.current || editor.isDestroyed) return;
      const box = toolbar.current.getBoundingClientRect(),
        rect = anchor.rect;
      const scroll = editor.isDestroyed
        ? undefined
        : editor.view.dom.closest(".notes-scroll")?.getBoundingClientRect();
      const ceiling = Math.max(8, (scroll?.top ?? 0) + 8);
      setPosition({
        left: Math.max(
          8,
          Math.min(
            rect.left + rect.width / 2 - box.width / 2,
            innerWidth - box.width - 8,
          ),
        ),
        top: Math.max(
          ceiling,
          Math.min(
            rect.top - box.height - 8 >= ceiling
              ? rect.top - box.height - 8
              : rect.bottom + 8,
            innerHeight - box.height - 8,
          ),
        ),
      });
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(toolbar.current);
    return () => resize.disconnect();
  }, [anchor, editor]);
  if (!anchor || disabled) return null;
  return createPortal(
    <div
      ref={toolbar}
      className="writing-selection-toolbar"
      role="toolbar"
      aria-label="选中文字样式"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {textFormats.map(([kind, label, Icon]) => (
        <button
          key={kind}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={
            kind in state ? state[kind as keyof typeof state] : undefined
          }
          onClick={() => onFormat(kind, anchor.range)}
        >
          <Icon size={17} />
        </button>
      ))}
      <span className="writing-toolbar-divider" />
      <button
        aria-label="行内公式"
        title="行内公式"
        onClick={() => onFormat("formula", anchor.range)}
      >
        <Sigma size={17} />
      </button>
    </div>,
    document.body,
  );
}
