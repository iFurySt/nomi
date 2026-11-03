import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { Selection, TextSelection } from "@tiptap/pm/state";
import type { TextFormat, TextRange } from "./SelectionToolbar";
import { BlockActions, type InsertKind } from "./BlockActions";
import { isList, isListItem, textUnit, insertText } from "./textStructure";
import { readMathSource, writeMathSource } from "./mathSource";
import { tableRows, delimitedTable, downloadTable } from "./tableOutput";

export function insertionNode(kind: InsertKind): JSONContent {
  const paragraph = { type: "paragraph" };
  if (kind === "heading1" || kind === "heading2" || kind === "heading3")
    return { type: "heading", attrs: { level: Number(kind.at(-1)) } };
  if (kind === "bulletList" || kind === "orderedList")
    return {
      type: kind,
      content: [{ type: "listItem", content: [paragraph] }],
    };
  if (kind === "taskList")
    return {
      type: kind,
      content: [
        { type: "taskItem", attrs: { checked: false }, content: [paragraph] },
      ],
    };
  if (kind === "table")
    return {
      type: "table",
      content: Array.from({ length: 3 }, (_, row) => ({
        type: "tableRow",
        content: Array.from({ length: 2 }, () => ({
          type: row === 0 ? "tableHeader" : "tableCell",
          content: [{ type: "paragraph" }],
        })),
      })),
    };
  if (kind === "blockquote") return { type: kind, content: [paragraph] };
  return { type: kind };
}
export function nodePositions(editor: Editor) {
  const nodes: { pos: number; end: number; element: HTMLElement }[] = [];
  if (editor.isDestroyed) return nodes;
  const visit = (node: typeof editor.state.doc, pos: number) => {
    if (isList(node)) {
      node.forEach((child, offset) => visit(child, pos + 1 + offset));
      return;
    }
    const element = editor.view.nodeDOM(pos);
    if (element instanceof HTMLElement)
      nodes.push({ pos, end: pos + node.nodeSize, element });
    if (isListItem(node))
      node.forEach((child, offset) => {
        if (isList(child)) visit(child, pos + 1 + offset);
      });
  };
  editor.state.doc.forEach(visit);
  return nodes;
}
function ownRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const nested = [...element.children].find((child) => child.matches("ul,ol"));
  return {
    top: rect.top,
    bottom: nested?.getBoundingClientRect().top ?? rect.bottom,
  };
}
export function dropPosition(
  editor: Editor,
  y: number,
): { pos: number; top: number } {
  const nodes = nodePositions(editor);
  for (const node of nodes) {
    const rect = ownRect(node.element);
    if (y < (rect.top + rect.bottom) / 2)
      return { pos: node.pos, top: rect.top };
  }
  const last = nodes.at(-1);
  return {
    pos: last?.end ?? editor.state.doc.content.size,
    top: last?.element.getBoundingClientRect().bottom ?? y,
  };
}
export function RichBlockFrame({
  editor,
  hideBlockTools,
  onInsert,
  onDrag,
  onDragEnd,
  onMove,
  onFormat,
  onCanvas,
  onFormula,
}: {
  editor: Editor;
  hideBlockTools: boolean;
  onInsert: (kind: InsertKind, pos: number, replaceTo?: number) => void;
  onFormat: (format: TextFormat, range: TextRange) => void;
  onFormula: (range: TextRange) => void;
  onCanvas: () => void;
  onDrag: (
    event: DragEvent<HTMLButtonElement>,
    pos: number,
    end: number,
  ) => void;
  onDragEnd: () => void;
  onMove: (pos: number, end: number, direction: -1 | 1) => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(0),
    [version, update] = useState(0);
  const menuOpen = useRef(false);
  useLayoutEffect(() => {
    if (hideBlockTools) menuOpen.current = false;
  }, [hideBlockTools]);
  const stopSelecting = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => stopSelecting.current?.(), []);
  const selectFromGutter = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      event.defaultPrevented ||
      editor.isDestroyed ||
      editor.view.composing ||
      (event.target as HTMLElement).closest("button,[draggable]")
    )
      return;
    const view = editor.view;
    const rect = view.dom.getBoundingClientRect();
    if (
      event.clientX < rect.left - 10 ||
      event.clientX >= rect.left ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      return;
    const position = (x: number, y: number) => {
      const bounds = view.dom.getBoundingClientRect();
      return view.posAtCoords({
        left: Math.max(bounds.left + 1, Math.min(bounds.right - 1, x)),
        top: Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, y)),
      })?.pos;
    };
    const pos = position(rect.left + 1, event.clientY);
    if (pos === undefined) return;
    event.preventDefault();
    stopSelecting.current?.();
    const selection = TextSelection.near(view.state.doc.resolve(pos));
    const anchor = event.shiftKey
      ? view.state.selection.anchor
      : selection.anchor;
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.between(
          view.state.doc.resolve(anchor),
          view.state.doc.resolve(selection.head),
        ),
      ),
    );
    view.focus();
    const move = (event: globalThis.MouseEvent) => {
      if (editor.isDestroyed) {
        stop();
        return;
      }
      const head = position(event.clientX, event.clientY);
      if (head === undefined) return;
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.between(
            view.state.doc.resolve(anchor),
            view.state.doc.resolve(head),
          ),
        ),
      );
    };
    const stop = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
      stopSelecting.current = undefined;
    };
    stopSelecting.current = stop;
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", stop);
  };
  useLayoutEffect(() => {
    if (editor.isDestroyed || hideBlockTools) return;
    const refresh = () => update((v) => v + 1);
    editor.on("transaction", refresh);
    const followSelection = () => {
      if (menuOpen.current) return;
      const index = nodePositions(editor)
        .map(
          (node) =>
            editor.state.selection.from >= node.pos &&
            editor.state.selection.from < node.end,
        )
        .lastIndexOf(true);
      if (index >= 0) setHover(index);
    };
    editor.on("selectionUpdate", followSelection);
    const resize = new ResizeObserver(refresh);
    resize.observe(editor.view.dom);
    refresh();
    return () => {
      editor.off("transaction", refresh);
      editor.off("selectionUpdate", followSelection);
      resize.disconnect();
    };
  }, [editor, hideBlockTools]);
  void version;
  // Typing hides the gutter; do not walk every ProseMirror DOM node just to
  // position an invisible control (nodeDOM lookup is linear in sibling count).
  const nodes = hideBlockTools ? [] : nodePositions(editor);
  const current = nodes[Math.min(hover, nodes.length - 1)];
  const top =
    current && wrapper.current
      ? current.element.getBoundingClientRect().top -
        wrapper.current.getBoundingClientRect().top
      : 0;
  const insert = (kind: InsertKind) => {
    if (!current || editor.isDestroyed) return;
    const node = editor.state.doc.nodeAt(current.pos);
    const empty = node?.type.name === "paragraph" && node.content.size === 0;
    const range = empty
      ? { from: current.pos, to: current.end }
      : { from: current.end, to: current.end };
    if (
      kind === "asset" ||
      kind === "canvas" ||
      kind === "experiment" ||
      kind === "note-reference"
    ) {
      onInsert(kind, range.from, empty ? range.to : undefined);
      return;
    }
    if (kind === "formula") {
      onFormula(range);
      return;
    }
    if (node && isListItem(node)) {
      const added = editor.schema.nodeFromJSON(insertionNode(kind));
      const next = insertText(
        editor.state.doc,
        range.from,
        added.type.schema.nodes.doc.create(null, added).content,
      );
      editor.commands.setContent(next.toJSON());
    } else editor.commands.insertContentAt(range, insertionNode(kind));
    const pos = Math.min(range.from + 1, editor.state.doc.content.size);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        Selection.near(editor.state.doc.resolve(pos)),
      ),
    );
    editor.commands.focus();
  };
  const node = current ? editor.state.doc.nodeAt(current.pos) : undefined;
  const kind =
    node && isListItem(node) && current
      ? editor.state.doc.resolve(current.pos).parent.type.name
      : node?.type.name === "heading"
        ? `heading${node.attrs.level}`
        : node?.type.name;
  const convert = (kind: InsertKind) => {
    if (!current) return;
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: current.pos + 1, to: current.end - 1 })
      .clearNodes();
    if (kind.startsWith("heading"))
      chain.setHeading({ level: Number(kind.at(-1)) as 1 | 2 | 3 }).run();
    else if (kind === "paragraph") chain.setParagraph().run();
    else if (kind === "bulletList") chain.toggleBulletList().run();
    else if (kind === "orderedList") chain.toggleOrderedList().run();
    else if (kind === "taskList") chain.toggleTaskList().run();
    else if (kind === "blockquote") chain.toggleBlockquote().run();
    else if (kind === "codeBlock") chain.setCodeBlock().run();
  };
  const tableCommand = (
    command: "addRowAfter" | "addColumnAfter" | "deleteRow" | "deleteTable",
  ) => {
    if (!current || editor.isDestroyed) return;
    const within =
      editor.state.selection.from > current.pos &&
      editor.state.selection.to < current.end;
    const chain = editor.chain().focus();
    if (!within) chain.setTextSelection(current.pos + 3);
    chain[command]().run();
  };
  return (
    <div
      className="writing-rich-frame"
      ref={wrapper}
      onMouseDown={selectFromGutter}
      onPointerMove={(event) => {
        if (
          menuOpen.current ||
          event.buttons ||
          !event.currentTarget.contains(event.target as Node) ||
          (event.target as HTMLElement).closest(".writing-block-gutter")
        )
          return;
        // The first pointer move reveals the gutter in the parent. Resolve its
        // actual row now; the hidden render deliberately has no node list.
        const pointerNodes = hideBlockTools ? nodePositions(editor) : nodes;
        const index = pointerNodes.findIndex(
          (node) => event.clientY < ownRect(node.element).bottom,
        );
        setHover(index < 0 ? Math.max(0, pointerNodes.length - 1) : index);
      }}
      onFocusCapture={(event) => {
        // React portal focus still reaches this frame. Only caret focus inside
        // the editor may change the row; menu focus must keep its original anchor.
        if (menuOpen.current || !editor.view.dom.contains(event.target as Node))
          return;
        const index = nodes
          .map(
            (node) =>
              editor.state.selection.from >= node.pos &&
              editor.state.selection.from < node.end,
          )
          .lastIndexOf(true);
        if (index >= 0) setHover(index);
      }}
    >
      <EditorContent editor={editor} />
      {current && !hideBlockTools && (
        <BlockActions
          top={top}
          kind={kind}
          empty={node?.type.name === "paragraph" && node.content.size === 0}
          onCanvas={onCanvas}
          mathAlignment={
            node?.type.name === "blockMath"
              ? {
                  value: readMathSource(node.attrs.latex).alignment,
                  change: (alignment) => {
                    if (!current || editor.isDestroyed) return;
                    editor.view.dispatch(
                      editor.state.tr.setNodeMarkup(current.pos, undefined, {
                        ...node.attrs,
                        latex: writeMathSource(node.attrs.latex, alignment),
                      }),
                    );
                  },
                }
              : undefined
          }
          tableOutput={
            node?.type.name === "table"
              ? {
                  copy: () =>
                    navigator.clipboard.writeText(
                      delimitedTable(tableRows(node), "\t"),
                    ),
                  download: () => downloadTable(node),
                }
              : undefined
          }
          onFormat={
            (node &&
              [
                "paragraph",
                "heading",
                "bulletList",
                "orderedList",
                "taskList",
                "blockquote",
              ].includes(node.type.name)) ||
            (node && isListItem(node))
              ? (format) => {
                  if (!current || editor.isDestroyed) return;
                  const selection = TextSelection.between(
                    editor.state.doc.resolve(current.pos + 1),
                    editor.state.doc.resolve(current.end - 1),
                  );
                  onFormat(format, { from: selection.from, to: selection.to });
                }
              : undefined
          }
          tableActions={
            node?.type.name === "table"
              ? [
                  { label: "加一行", run: () => tableCommand("addRowAfter") },
                  {
                    label: "加一列",
                    run: () => tableCommand("addColumnAfter"),
                  },
                  { label: "删除行", run: () => tableCommand("deleteRow") },
                  { label: "删除表格", run: () => tableCommand("deleteTable") },
                ]
              : undefined
          }
          onConvert={
            (node &&
              [
                "paragraph",
                "heading",
                "bulletList",
                "orderedList",
                "taskList",
                "blockquote",
                "codeBlock",
              ].includes(node.type.name)) ||
            (node && isListItem(node))
              ? convert
              : undefined
          }
          onRemove={() => {
            if (current) {
              const unit = textUnit(editor.state.doc, current.pos, current.end);
              editor
                .chain()
                .focus()
                .deleteRange({ from: unit.from, to: unit.to })
                .run();
            }
          }}
          onOpenChange={(open) => {
            menuOpen.current = open;
          }}
          onInsert={insert}
          onDragStart={(event) => onDrag(event, current.pos, current.end)}
          onDragEnd={onDragEnd}
          onMove={(direction) => onMove(current.pos, current.end, direction)}
        />
      )}
    </div>
  );
}
