import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Pencil,
  Copy,
  Check,
} from "lucide-react";
import { Tooltip } from "../components/Tooltip";
import { readMathSource, writeMathSource } from "./mathSource";
import { formulaText } from "./mathClipboard";
import type { FormulaSession } from "./FormulaPopover";

export function FormulaToolbar({
  editor,
  disabled,
  onEdit,
}: {
  editor: Editor;
  disabled: boolean;
  onEdit: (session: FormulaSession) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    if (!copied && !copyError) return;
    const timer = setTimeout(() => {
      setCopied(false);
      setCopyError(false);
    }, 1600);
    return () => clearTimeout(timer);
  }, [copied, copyError]);
  const [dismissed, setDismissed] = useState(false);
  const selected = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const selection = e.state.selection;
      if (
        !e.isFocused ||
        !(selection instanceof NodeSelection) ||
        !["blockMath", "inlineMath"].includes(selection.node.type.name)
      )
        return null;
      return {
        pos: selection.from,
        latex: selection.node.attrs.latex as string,
        block: selection.node.type.name === "blockMath",
      };
    },
  });
  useEffect(() => {
    setDismissed(false);
    setCopied(false);
    setCopyError(false);
  }, [disabled, selected?.pos, selected?.latex]);
  const anchor = useRef({ getBoundingClientRect: () => new DOMRect() });
  anchor.current.getBoundingClientRect = () => {
    if (editor.isDestroyed) return new DOMRect();
    const node = editor.view.nodeDOM(editor.state.selection.from);
    return node instanceof HTMLElement
      ? (
          node.querySelector(".block-math-inner") ?? node
        ).getBoundingClientRect()
      : new DOMRect();
  };
  if (!selected || disabled || dismissed) return null;
  return (
    <Popover.Root open onOpenChange={(open) => !open && setDismissed(true)}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          className="writing-selection-toolbar writing-formula-toolbar"
          role="toolbar"
          aria-label="公式样式"
          side="top"
          sideOffset={8}
          collisionPadding={12}
          updatePositionStrategy="always"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
        >
          <Tooltip label="编辑公式">
            <button aria-label="编辑公式" onClick={() => onEdit(selected)}>
              <Pencil size={17} />
            </button>
          </Tooltip>
          {selected.block && (
            <>
              <span className="writing-toolbar-divider" />
              {(
                [
                  ["left", "左对齐", AlignLeft],
                  ["center", "居中", AlignCenter],
                  ["right", "右对齐", AlignRight],
                ] as const
              ).map(([alignment, label, Icon]) => (
                <Tooltip key={alignment} label={label}>
                  <button
                    aria-label={label}
                    aria-pressed={
                      readMathSource(selected.latex).alignment === alignment
                    }
                    onClick={() =>
                      editor
                        .chain()
                        .focus()
                        .updateAttributes("blockMath", {
                          latex: writeMathSource(selected.latex, alignment),
                        })
                        .run()
                    }
                  >
                    <Icon size={17} />
                  </button>
                </Tooltip>
              ))}
            </>
          )}
          <span className="writing-toolbar-divider" />
          <Tooltip
            label={
              copyError ? "复制失败，请重试" : copied ? "已复制" : "复制 LaTeX"
            }
          >
            <button
              aria-label={copied ? "已复制 LaTeX" : "复制 LaTeX"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    formulaText(selected.latex, selected.block),
                  );
                  setCopied(true);
                  setCopyError(false);
                } catch {
                  setCopyError(true);
                }
              }}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
          </Tooltip>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
