import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import type { TextRange } from "./SelectionToolbar";
import { readMathSource, writeMathSource } from "./mathSource";

export type FormulaSession = {
  latex: string;
  block: boolean;
  pos?: number;
  range?: TextRange;
};

export function FormulaPopover({
  editor,
  session,
  onClose,
}: {
  editor: Editor;
  session: FormulaSession;
  onClose: () => void;
}) {
  const target = useRef({ ...session });
  const ownChange = useRef(false);
  const closing = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [latex, setLatex] = useState(readMathSource(session.latex).latex);
  const type = session.block ? "blockMath" : "inlineMath";
  const anchor = useRef({
    getBoundingClientRect: () => {
      if (editor.isDestroyed) return new DOMRect();
      const pos = target.current.pos;
      const node = pos === undefined ? undefined : editor.view.nodeDOM(pos);
      if (node instanceof HTMLElement) return node.getBoundingClientRect();
      const rect = editor.view.coordsAtPos(
        Math.min(
          target.current.range?.from ?? editor.state.selection.from,
          editor.state.doc.content.size,
        ),
      );
      return new DOMRect(
        rect.left,
        rect.top,
        Math.max(1, rect.right - rect.left),
        rect.bottom - rect.top,
      );
    },
  });
  useEffect(() => {
    const mapTarget = ({ transaction }: { transaction: Transaction }) => {
      if (ownChange.current || !transaction.docChanged) return;
      const current = target.current;
      if (current.pos !== undefined) {
        const mapped = transaction.mapping.mapResult(current.pos);
        if (
          mapped.deletedAcross ||
          editor.state.doc.nodeAt(mapped.pos)?.type.name !== type
        ) {
          onClose();
          return;
        }
        current.pos = mapped.pos;
      } else if (current.range) {
        current.range = {
          from: transaction.mapping.map(current.range.from, -1),
          to: transaction.mapping.map(current.range.to, 1),
        };
      }
    };
    editor.on("transaction", mapTarget);
    return () => {
      editor.off("transaction", mapTarget);
    };
  }, [editor, type, onClose]);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = `${Math.min(240, Math.max(70, textarea.current.scrollHeight))}px`;
  }, [latex]);
  const change = (value: string) => {
    setLatex(value);
    if (editor.isDestroyed || !value.trim()) return;
    const current = target.current;
    ownChange.current = true;
    try {
      if (current.pos !== undefined) {
        const node = editor.state.doc.nodeAt(current.pos);
        if (node?.type.name !== type) {
          onClose();
          return;
        }
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(current.pos, undefined, {
            ...node.attrs,
            latex: session.block
              ? writeMathSource(
                  value,
                  readMathSource(node.attrs.latex).alignment,
                )
              : value,
          }),
        );
      } else {
        const range = current.range ?? editor.state.selection;
        const inserted = editor.commands.insertContentAt(range, {
          type,
          attrs: { latex: value },
        });
        if (!inserted) return;
        let nearest = Infinity;
        editor.state.doc.descendants((node, pos) => {
          if (
            node.type.name === type &&
            node.attrs.latex === value &&
            Math.abs(pos - range.from) < nearest
          ) {
            current.pos = pos;
            nearest = Math.abs(pos - range.from);
          }
        });
      }
    } finally {
      ownChange.current = false;
    }
  };
  const finish = () => {
    if (closing.current) return;
    closing.current = true;
    const pos = target.current.pos;
    if (!latex.trim() && pos !== undefined && !editor.isDestroyed) {
      const node = editor.state.doc.nodeAt(pos);
      if (node?.type.name === type)
        editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize });
    }
    onClose();
  };
  return (
    <Popover.Root open onOpenChange={(open) => !open && finish()}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          className="writing-math-popover"
          aria-label="编辑公式"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          updatePositionStrategy="always"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            textarea.current?.focus({ preventScroll: true });
            textarea.current?.select();
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            finish();
            if (!editor.isDestroyed)
              editor.commands.focus(undefined, { scrollIntoView: false });
          }}
        >
          <textarea
            ref={textarea}
            aria-label="LaTeX 公式"
            value={latex}
            spellCheck={false}
            placeholder="E = mc^2"
            onChange={(event) => change(event.target.value)}
          />
          <small>
            <kbd>Esc</kbd> 完成
          </small>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
