import { useLayoutEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { NoteAnnotation } from "@nomi/core";
export type AnchoredAnnotation = NoteAnnotation & {
  rowId: string;
  editor?: Editor;
  from?: number;
  to?: number;
};
/** References are snapshots; decorations map with edits and never enter saved Markdown. */
export function NoteAnnotationHighlight({
  annotation,
  number,
  onOpen,
}: {
  annotation: AnchoredAnnotation;
  number: number;
  onOpen: () => void;
}) {
  const { editor, from, to, id } = annotation;
  const badgeRef = useRef<HTMLButtonElement | null>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useLayoutEffect(() => {
    if (badgeRef.current)
      badgeRef.current.setAttribute("aria-label", `打开批注 ${number}`);
    if (badgeRef.current) badgeRef.current.textContent = String(number);
  }, [number]);
  useLayoutEffect(() => {
    if (
      !editor ||
      editor.isDestroyed ||
      from === undefined ||
      to === undefined ||
      to > editor.state.doc.content.size
    )
      return;
    const original = editor.state.doc.textBetween(from, to, "\n");
    const key = new PluginKey("annotation-" + id);
    editor.registerPlugin(
      new Plugin({
        key,
        state: {
          init: (_, state) =>
            DecorationSet.create(state.doc, [
              Decoration.inline(from, to, {
                class: "note-annotation-highlight",
                "data-annotation-range": id,
              }),
              Decoration.widget(
                to,
                () => {
                  const badge = document.createElement("button");
                  badge.type = "button";
                  badge.dataset.annotationId = id;
                  badge.setAttribute("aria-label", `打开批注 ${number}`);
                  badge.onmousedown = (e) => e.preventDefault();
                  badge.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openRef.current();
                  };
                  badgeRef.current = badge;
                  badge.className = "note-annotation-badge";
                  badge.textContent = String(number);
                  badge.contentEditable = "false";
                  const anchor = document.createElement("span");
                  anchor.className = "note-annotation-anchor";
                  anchor.contentEditable = "false";
                  anchor.append(badge);
                  return anchor;
                },
                { side: -1, ignoreSelection: true },
              ),
            ]),
          apply: (tr, decorations) => {
            const mapped = decorations.map(tr.mapping, tr.doc);
            // A deleted quote loses its badge too; the reference snapshot remains in the composer.
            const range = mapped.find().find((d) => d.from !== d.to);
            return range &&
              tr.doc.textBetween(range.from, range.to, "\n") === original
              ? mapped
              : DecorationSet.empty;
          },
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    );
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
    };
  }, [editor, from, to, id]);
  return null;
}
