import { useEffect, useRef, useState, type DragEvent } from "react";
import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { normalizeClipboardHTML, plainTextSlice } from "./clipboard";
import { notionClipboardData, restoreNotionBlanks } from "./notionClipboard";
import { RichBlockFrame } from "./RichBlockFrame";
import type { InsertKind } from "./BlockActions";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { InlineMath } from "@tiptap/extension-mathematics";
import { WritingBlockMath } from "./WritingMath";
import { FormulaPopover, type FormulaSession } from "./FormulaPopover";
import { withoutTableBreaks } from "./tableMarkdown";
import { WritingCodeBlock } from "./CodeBlock";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Modal } from "../components/primitives";
import {
  SelectionToolbar,
  formatText,
  type TextFormat,
  type TextRange,
} from "./SelectionToolbar";
import "katex/dist/katex.min.css";
import "./math.css";

// Keep unrepresented syntax in source mode. Opening a document must never rewrite it.
export function needsSourceEditor(source: string) {
  const prose = source
    .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]+\$/g, "");
  return (
    /^---\s*$/m.test(prose.split("\n").slice(0, 1).join("")) ||
    /<\/?[A-Za-z!]|\{%|\{\{|!\[|\[\^[^\]]+\]|^\[[^\]]+\]:/m.test(
      withoutTableBreaks(prose),
    )
  );
}
export function RichMarkdownEditor({
  source,
  onChange,
  onBlur,
  onActivate,
  onBoundary,
  onCanvas,
  onEditor,
  onInsert,
  onBlockDrag,
  onBlockDragEnd,
  onBlockMove,
  placeholder = "从这里开始写作…",
  hideBlockTools = false,
}: {
  source: string;
  onChange: (source: string, isolated?: boolean) => void;
  onBlur: () => void;
  onActivate: () => void;
  onBoundary: (direction: "previous" | "next") => boolean;
  onCanvas: () => void;
  onEditor: (editor: Editor | null) => void;
  onInsert: (kind: InsertKind, pos: number, replaceTo?: number) => void;
  onBlockDrag: (
    event: DragEvent<HTMLButtonElement>,
    pos: number,
    end: number,
  ) => void;
  onBlockDragEnd: () => void;
  onBlockMove: (pos: number, end: number, direction: -1 | 1) => void;
  placeholder?: string;
  hideBlockTools?: boolean;
}) {
  const callbacks = useRef({ onChange, onBlur, onActivate, onBoundary });
  callbacks.current = { onChange, onBlur, onActivate, onBoundary };
  const emitted = useRef(source);
  // The document history is shared with attachments and Canvas. Retain the
  // local caret for each source snapshot when that history restores text.
  const selections = useRef(new Map<string, ReturnType<Selection["toJSON"]>>());
  const lastSelection = useRef<ReturnType<Selection["toJSON"]> | undefined>(
    undefined,
  );
  const receivingSource = useRef(false);
  const rememberSelection = (
    source: string,
    selection: ReturnType<Selection["toJSON"]>,
  ) => {
    selections.current.set(source, selection);
    if (selections.current.size > 40)
      selections.current.delete(selections.current.keys().next().value!);
  };
  const [math, setMath] = useState<FormulaSession>();
  const [link, setLink] = useState<{ href: string; range: TextRange }>();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        dropcursor: { class: "writing-native-dropcursor" },
        underline: false,
        trailingNode: {
          notAfter: [
            "heading",
            "codeBlock",
            "blockquote",
            "bulletList",
            "orderedList",
            "taskList",
          ],
        },
        link: { openOnClick: false, defaultProtocol: "https" },
      }),
      Markdown,
      WritingCodeBlock,
      TableKit.configure({ table: { renderWrapper: true } }),
      TaskList,
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { "data-type": "taskItem" },
      }),
      InlineMath.configure({
        katexOptions: { throwOnError: false, trust: false },
        onClick: (node, pos) => {
          editor?.commands.setNodeSelection(pos);
          setMath({ latex: node.attrs.latex, block: false, pos });
        },
      }),
      WritingBlockMath.configure({
        katexOptions: { throwOnError: false, trust: false, displayMode: true },
        onClick: (node, pos) => {
          editor?.commands.setNodeSelection(pos);
          setMath({ latex: node.attrs.latex, block: true, pos });
        },
      }),
    ],
    content: source,
    contentType: "markdown",
    editorProps: {
      transformPastedHTML: normalizeClipboardHTML,
      clipboardTextParser: (text, context, plain, view) => {
        // Explicit Markdown structures paste as editable content. Ordinary prose
        // keeps its exact line breaks, and Shift-paste remains plain text.
        if (
          !plain &&
          !context.parent.type.spec.code &&
          editor?.markdown &&
          /^(?:#{1,3} |```|~~~|> |[-*+] |\d+\. )|^\s*\|.*\|\s*\n\s*\|[\s:|-]+\|/m.test(
            text,
          )
        ) {
          try {
            const parsed = view.state.schema.nodeFromJSON(
              editor.markdown.parse(text),
            );
            return Slice.maxOpen(Fragment.from(parsed.content));
          } catch {
            /* Fall back to the original plain-text paste. */
          }
        }
        return plainTextSlice(text, context, view.state.schema)!;
      },
      handlePaste(view, event, slice) {
        if (view.state.selection.$from.parent.type.spec.code) return false;
        const restored = restoreNotionBlanks(
          notionClipboardData(event.clipboardData),
          slice,
          view.state.schema,
        );
        if (!restored) return false;
        view.dispatch(
          view.state.tr
            .replaceSelection(restored)
            .scrollIntoView()
            .setMeta("paste", true)
            .setMeta("uiEvent", "paste"),
        );
        return true;
      },
      handleKeyDown(view, event) {
        if (
          event.isComposing ||
          view.composing ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          !view.state.selection.empty
        )
          return false;
        const { from } = view.state.selection;
        if (event.key === "ArrowUp" && from === 1)
          return callbacks.current.onBoundary("previous");
        if (
          event.key === "ArrowDown" &&
          from === view.state.doc.content.size - 1
        )
          return callbacks.current.onBoundary("next");
        return false;
      },
      attributes: {
        "aria-label": "文稿正文",
        role: "textbox",
        "aria-multiline": "true",
        "data-placeholder": placeholder,
      },
    },
    onTransaction: ({ editor, transaction }) => {
      if (receivingSource.current) return;
      if (transaction.docChanged && lastSelection.current)
        rememberSelection(emitted.current, lastSelection.current);
      lastSelection.current = editor.state.selection.toJSON();
      if (!transaction.docChanged)
        rememberSelection(emitted.current, lastSelection.current);
    },
    onUpdate: ({ editor, transaction }) => {
      const next = editor.getMarkdown();
      emitted.current = next;
      rememberSelection(next, editor.state.selection.toJSON());
      callbacks.current.onChange(
        next,
        !!transaction.getMeta("paste") ||
          ["paste", "cut", "drop"].includes(transaction.getMeta("uiEvent")),
      );
    },
    onBlur: () => callbacks.current.onBlur(),
    onFocus: () => callbacks.current.onActivate(),
  });
  useEffect(() => {
    if (editor && source !== emitted.current) {
      const saved = selections.current.get(source);
      const previous = editor.state.selection.from;
      receivingSource.current = true;
      try {
        emitted.current = source;
        editor.commands.setContent(source, {
          contentType: "markdown",
          emitUpdate: false,
        });
        let restored: Selection;
        try {
          restored = saved
            ? Selection.fromJSON(editor.state.doc, saved)
            : TextSelection.near(
                editor.state.doc.resolve(
                  Math.min(previous, editor.state.doc.content.size),
                ),
              );
        } catch {
          restored = TextSelection.near(
            editor.state.doc.resolve(
              Math.min(previous, editor.state.doc.content.size),
            ),
          );
        }
        const transaction = editor.state.tr.setSelection(restored);
        editor.view.dispatch(
          editor.isFocused ? transaction.scrollIntoView() : transaction,
        );
        lastSelection.current = editor.state.selection.toJSON();
      } finally {
        receivingSource.current = false;
      }
    }
  }, [source, editor]);
  const editorCallback = useRef(onEditor);
  editorCallback.current = onEditor;
  useEffect(() => {
    editorCallback.current(editor);
    return () => editorCallback.current(null);
  }, [editor]);
  if (!editor) return null;
  const applyFormat = (format: TextFormat, range: TextRange) => {
    if (editor.isDestroyed) return;
    if (format === "link") {
      editor.commands.setTextSelection(range);
      setLink({ href: String(editor.getAttributes("link").href ?? ""), range });
    } else if (format === "formula") {
      setMath({
        latex: editor.state.doc.textBetween(range.from, range.to),
        block: false,
        range,
      });
    } else formatText(editor, format, range);
  };
  return (
    <div className="rich-writing">
      <SelectionToolbar
        editor={editor}
        onFormat={applyFormat}
        disabled={!!math || !!link}
      />
      <RichBlockFrame
        editor={editor}
        hideBlockTools={hideBlockTools}
        onInsert={onInsert}
        onDrag={onBlockDrag}
        onDragEnd={onBlockDragEnd}
        onMove={onBlockMove}
        onFormat={applyFormat}
        onFormula={(range) => setMath({ latex: "", block: true, range })}
        onCanvas={onCanvas}
      />
      {math && (
        <FormulaPopover
          key={`${math.pos ?? "insert"}:${math.range?.from}:${math.block}`}
          editor={editor}
          session={math}
          onClose={() => setMath(undefined)}
        />
      )}
      <Modal
        open={!!link}
        onOpenChange={(open) => !open && setLink(undefined)}
        title="插入链接"
      >
        <form
          className="writing-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!link || editor.isDestroyed) return;
            const href = link.href.trim();
            if (href && !/^(https?:\/\/|mailto:)/i.test(href)) return;
            const chain = editor.chain().focus().setTextSelection(link.range);
            if (!href) chain.unsetLink().run();
            else if (link.range.from === link.range.to)
              chain
                .insertContent({
                  type: "text",
                  text: href,
                  marks: [{ type: "link", attrs: { href } }],
                })
                .run();
            else chain.setLink({ href }).run();
            setLink(undefined);
          }}
        >
          <input
            aria-label="链接地址"
            autoFocus
            value={link?.href ?? ""}
            placeholder="https://"
            onChange={(e) =>
              setLink(link ? { ...link, href: e.target.value } : undefined)
            }
          />
          <small>支持 https、http 和 mailto；留空移除链接。</small>
          <button type="submit">保存链接</button>
        </form>
      </Modal>
    </div>
  );
}
