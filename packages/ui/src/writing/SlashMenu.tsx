import { useEffect, useId, useRef, useState } from "react";
import { SearchX, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import { blockChoices, type InsertKind } from "./BlockActions";
import { insertionNode } from "./RichBlockFrame";
import "./slash-menu.css";
import type { NoteAIRange } from "./noteAI";

const aliases: Record<InsertKind, string> = {
  canvas: "canvas drawing draw sketch huaban huabu 画板 画布 绘图 涂鸦 手绘",
  paragraph: "text plain 正文 文本",
  heading1: "h1 heading 标题 一级 #",
  heading2: "h2 heading 标题 二级 ##",
  heading3: "h3 heading 标题 三级 ###",
  bulletList: "bullet list 无序 列表",
  orderedList: "numbered ordered list 有序 列表",
  taskList: "todo task checklist 任务 待办",
  blockquote: "quote 引用",
  codeBlock: "code 代码",
  horizontalRule: "divider line 分割 分隔线",
  table: "table 表格",
  formula: "math latex equation 公式 数学",
  "note-reference": "page document note 文稿 子页 笔记",
  asset: "image photo file video 图片 文件 附件 视频",
  experiment: "interactive genui experiment 交互 实验",
};
const common = new Set<InsertKind>([
  "canvas",
  "table",
  "formula",
  "note-reference",
  "asset",
  "experiment",
]);

// Standalone commands offer all blocks. Inline /ai commands preserve surrounding
// prose; slash inside URLs/code is ordinary text. Selected text uses a virtual menu.
function commandAtCaret(editor: Editor) {
  const { $from, from, empty } = editor.state.selection;
  if (
    !empty ||
    $from.parent.type.name !== "paragraph" ||
    editor.isActive("code")
  )
    return;
  const text = $from.parent.textBetween(0, $from.parentOffset);
  if (
    $from.depth === 1 &&
    $from.parentOffset === $from.parent.content.size &&
    /^\/[^/\n]{0,48}$/.test(text)
  )
    return {
      from: $from.before(),
      to: $from.after(),
      query: text.slice(1).trim().toLowerCase(),
      inline: false,
    };
  const match = text.match(/(?:^|\s)\/([a-zA-Z\u4e00-\u9fff]{0,24})$/);
  if (match)
    return {
      from: from - match[1].length - 1,
      to: from,
      query: match[1].toLowerCase(),
      inline: true,
    };
}
type Session = NonNullable<ReturnType<typeof commandAtCaret>> & {
  virtual?: boolean;
};
type SlashKind = InsertKind | "ai";

export function SlashMenu({
  editor,
  onInsert,
  onFormula,
  onAI,
}: {
  editor: Editor;
  onAI?: (range: NoteAIRange) => void;
  onInsert: (
    kind: InsertKind,
    pos: number,
    replaceTo?: number,
    replaceText?: string,
  ) => void;
  onFormula: (range: { from: number; to: number }) => void;
}) {
  const id = useId();
  const [session, setSession] = useState<Session>();
  const [selected, setSelected] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    up: false,
    height: 360,
    width: 260,
  });
  const menu = useRef<HTMLDivElement>(null);
  const active = useRef<Session | undefined>(undefined);
  const dismissed = useRef(false);
  const actions = useRef({ onInsert, onFormula, onAI });
  actions.current = { onInsert, onFormula, onAI };
  const choices = [
    ...(onAI ? [["ai", "AI", Sparkles] as const] : []),
    ...blockChoices,
  ];
  const options = choices.filter(([kind, label]) =>
    (session?.virtual || session?.inline) && kind !== "ai"
      ? false
      : !session?.query ||
        `${label} ${kind} ${kind === "ai" ? "生成 智能 chatgpt" : aliases[kind]}`
          .toLowerCase()
          .includes(session.query),
  );
  const current = useRef({ options, selected });
  current.current = { options, selected };
  const close = () => {
    dismissed.current = true;
    active.current = undefined;
    setSession(undefined);
  };
  const choose = (kind: SlashKind) => {
    if (editor.isDestroyed || editor.view.composing) return;
    const range = active.current?.virtual
      ? active.current
      : commandAtCaret(editor);
    if (!range || !active.current) return;
    close();
    if (kind === "ai") {
      if (!("virtual" in range && range.virtual)) {
        // Remove only the typed command, retaining its paragraph and cursor.
        editor.commands.deleteRange(
          range.inline ? range : { from: range.from + 1, to: range.to - 1 },
        );
        const { from, to } = editor.state.selection;
        actions.current.onAI?.({ from, to });
      } else actions.current.onAI?.(range);
      return;
    }
    // Modal/file pickers retain the command until confirmed. Their existing
    // atomic insertion replaces this paragraph; cancelling loses no text.
    if (
      kind === "asset" ||
      kind === "canvas" ||
      kind === "experiment" ||
      kind === "note-reference"
    ) {
      actions.current.onInsert(
        kind,
        range.from,
        range.to,
        editor.state.doc.nodeAt(range.from)?.textContent,
      );
    } else if (kind === "formula") {
      actions.current.onFormula(range);
    } else {
      editor
        .chain()
        .focus()
        .insertContentAt(range, insertionNode(kind))
        .command(({ tr }) => {
          tr.setSelection(
            Selection.near(
              tr.doc.resolve(Math.min(range.from + 1, tr.doc.content.size)),
            ),
          );
          tr.setMeta("uiEvent", "paste"); // isolate conversion in the shared document history
          return true;
        })
        .run();
    }
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  useEffect(() => {
    let detach: (() => void) | undefined;
    const attach = () => {
      detach?.();
      if (editor.isDestroyed) return;
      const dom = editor.view.dom;
      let frame = 0;
      const locate = () => {
        if (!active.current || editor.isDestroyed) return;
        const caret = editor.view.coordsAtPos(
          Math.min(
            editor.state.doc.content.size,
            active.current.from + (active.current.virtual ? 0 : 1),
          ),
        );
        const bounds = dom.closest(".notes-scroll")?.getBoundingClientRect();
        if (
          caret.bottom < (bounds?.top ?? 0) ||
          caret.top > (bounds?.bottom ?? innerHeight)
        ) {
          close();
          return;
        }
        const width = Math.min(260, innerWidth - 24);
        const below = innerHeight - caret.bottom - 16;
        const above = caret.top - 16;
        const up = below < 260 && above > below;
        const height = Math.min(400, Math.max(80, up ? above : below));
        setPosition({
          left: Math.max(12, Math.min(caret.left, innerWidth - width - 12)),
          top: up ? caret.top - 8 : caret.bottom + 8,
          up,
          height,
          width,
        });
      };
      const update = () => {
        if (editor.isDestroyed) return;
        if (
          active.current?.virtual &&
          editor.isFocused &&
          editor.state.selection.from === active.current.from &&
          editor.state.selection.to === active.current.to
        )
          return;
        const next = commandAtCaret(editor);
        if (!next) dismissed.current = false;
        if (
          !next ||
          !editor.isFocused ||
          dismissed.current ||
          editor.view.composing
        ) {
          active.current = undefined;
          setSession(undefined);
          return;
        }
        if (
          active.current?.query !== next.query ||
          active.current?.from !== next.from
        )
          setSelected(0);
        active.current = next;
        setSession(next);
        locate();
      };
      const keydown = (event: KeyboardEvent) => {
        if (
          event.key === "/" &&
          actions.current.onAI &&
          !event.isComposing &&
          !editor.view.composing &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !active.current
        ) {
          const { from, to, empty } = editor.state.selection;
          if (
            !empty &&
            !editor.isActive("codeBlock") &&
            !editor.isActive("code")
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const next = { from, to, query: "", virtual: true, inline: true };
            active.current = next;
            dismissed.current = false;
            setSession(next);
            setSelected(0);
            locate();
            return;
          }
        }
        if (
          !active.current ||
          event.isComposing ||
          editor.view.composing ||
          event.keyCode === 229 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey
        )
          return;
        const { options, selected } = current.current;
        if (event.key === "Escape") close();
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          setSelected(
            options.length
              ? (selected +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                  options.length
              : 0,
          );
        } else if (event.key === "Enter" && options[selected])
          chooseRef.current(options[selected][0]);
        else return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const outside = (event: PointerEvent) => {
        if (
          active.current &&
          !menu.current?.contains(event.target as Node) &&
          !dom.contains(event.target as Node)
        )
          close();
      };
      const reposition = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(locate);
      };
      const compositionStart = () => {
        active.current = undefined;
        setSession(undefined);
      };
      const compositionEnd = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
      };
      editor.on("transaction", update).on("focus", update).on("blur", update);
      dom.addEventListener("keydown", keydown, true);
      dom.addEventListener("compositionstart", compositionStart);
      dom.addEventListener("compositionend", compositionEnd);
      document.addEventListener("pointerdown", outside, true);
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
      detach = () => {
        cancelAnimationFrame(frame);
        editor
          .off("transaction", update)
          .off("focus", update)
          .off("blur", update);
        dom.removeEventListener("keydown", keydown, true);
        dom.removeEventListener("compositionstart", compositionStart);
        dom.removeEventListener("compositionend", compositionEnd);
        document.removeEventListener("pointerdown", outside, true);
        window.removeEventListener("scroll", reposition, true);
        window.removeEventListener("resize", reposition);
      };
    };
    const unmount = () => {
      detach?.();
      detach = undefined;
      close();
    };
    editor.on("mount", attach).on("unmount", unmount);
    attach();
    return () => {
      editor.off("mount", attach).off("unmount", unmount);
      detach?.();
    };
  }, [editor]);
  useEffect(() => {
    if (editor.isDestroyed || !session) return;
    const dom = editor.view.dom;
    if (session) {
      dom.setAttribute("aria-controls", id);
      if (options[selected])
        dom.setAttribute(
          "aria-activedescendant",
          `${id}-${options[selected][0]}`,
        );
      else dom.removeAttribute("aria-activedescendant");
      menu.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
    return () => {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
    };
  }, [editor, session, selected, id, position.height]);
  if (!session) return null;
  return createPortal(
    <div
      ref={menu}
      className="writing-slash-menu"
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        maxHeight: position.height,
        transform: position.up ? "translateY(-100%)" : undefined,
      }}
      onPointerDown={(event) => event.preventDefault()}
    >
      <div
        className="writing-slash-options"
        id={id}
        role="listbox"
        aria-label="添加内容块"
      >
        {options.length === 0 && (
          <div
            className="writing-slash-empty"
            role="status"
            aria-label="无匹配内容块"
          >
            <SearchX size={22} strokeWidth={1.6} aria-hidden="true" />
            <span className="sr-only">无匹配内容块</span>
          </div>
        )}
        {options.map(([kind, label, Icon], index) => (
          <div key={kind}>
            {!session.query &&
              (index === 0 ||
                common.has(kind as InsertKind) !==
                  common.has(options[index - 1][0] as InsertKind)) && (
                <div className="writing-slash-group">
                  {common.has(kind as InsertKind) ? "内容块" : "基础"}
                </div>
              )}
            <button
              type="button"
              tabIndex={-1}
              role="option"
              id={`${id}-${kind}`}
              aria-selected={selected === index}
              onPointerMove={() => setSelected(index)}
              onClick={() => choose(kind)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {kind.startsWith("heading") && (
                <small>{"#".repeat(Number(kind.at(-1)))}</small>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
