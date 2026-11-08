import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** A view-only widget near the captured paragraph, never part of saved content. */
export function NoteAIPreview({
  editor,
  position,
  children,
}: {
  editor?: Editor;
  position?: number;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement>();
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || position === undefined) return;
    const target = document.createElement("div");
    target.className = "note-ai-preview";
    target.setAttribute("aria-label", "正在生成的内容");
    target.contentEditable = "false";
    target.inert = true;
    const key = new PluginKey("note-ai-preview");
    const pos = editor.state.doc.resolve(
      Math.min(position, editor.state.doc.content.size),
    );
    const boundary = pos.depth ? pos.after(1) : pos.pos;
    editor.registerPlugin(
      new Plugin({
        key,
        state: {
          init: (_, state) =>
            DecorationSet.create(state.doc, [
              Decoration.widget(boundary, target, {
                side: -1,
                ignoreSelection: true,
              }),
            ]),
          apply: (tr, decorations) => decorations.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    );
    setHost(target);
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
    };
  }, [editor, position]);
  if (!editor)
    return (
      <div className="note-ai-preview" aria-label="正在生成的内容">
        {children}
      </div>
    );
  return host ? createPortal(children, host) : null;
}
