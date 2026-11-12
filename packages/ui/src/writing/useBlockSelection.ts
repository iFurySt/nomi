import { useEffect, useRef, type RefObject } from "react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import type { CanvasCommand, CanvasDocument, CanvasNote } from "@nomi/core";
import { textSnapshot } from "./blockOperations";
import {
  BLOCK_CLIPBOARD,
  deleteSelected,
  encodeSelected,
  type SelectedBlock,
} from "./blockSelection";

const selectionKey = new PluginKey<DecorationSet>("nomiBlockMarquee");
type Unit = SelectedBlock & {
  editor?: Editor;
  element: HTMLElement;
  left: number;
  right: number;
  top: number;
  bottom: number;
};
type Options = {
  pane: RefObject<HTMLDivElement | null>;
  editors: RefObject<Map<string, Editor>>;
  document?: CanvasDocument;
  note?: CanvasNote;
  edit: (commands: CanvasCommand[]) => void;
  onError: (message: string) => void;
};
export function useBlockSelection(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    const pane = options.pane.current;
    if (!pane || !options.note) return;
    let selected: Unit[] = [],
      frame = 0;
    let drag:
      | {
          pointerId: number;
          x: number;
          y: number;
          clientX: number;
          clientY: number;
          started: boolean;
          units: Unit[];
          scrollTop: number;
        }
      | undefined;
    const overlay = document.createElement("div");
    overlay.className = "writing-marquee";
    const registered = new Set<Editor>();
    const paint = (units: Unit[]) => {
      if (
        units.length === selected.length &&
        units.every((u, i) => u === selected[i])
      )
        return;
      const next = new Set(units.map((u) => u.element));
      for (const u of selected)
        if (!u.editor && !next.has(u.element))
          u.element.removeAttribute("data-block-selected");
      for (const u of units)
        if (!u.editor) u.element.setAttribute("data-block-selected", "true");
      for (const editor of new Set(
        [...selected, ...units]
          .map((u) => u.editor)
          .filter((e): e is Editor => !!e),
      )) {
        if (editor.isDestroyed) continue;
        if (!selectionKey.getState(editor.state)) {
          editor.registerPlugin(
            new Plugin({
              key: selectionKey,
              state: {
                init: () => DecorationSet.empty,
                apply: (tr, previous) =>
                  tr.getMeta(selectionKey) ?? previous.map(tr.mapping, tr.doc),
              },
              props: { decorations: (state) => selectionKey.getState(state) },
            }),
          );
          registered.add(editor);
        }
        const decorations = units
          .filter((u) => u.editor === editor)
          .map((u) =>
            Decoration.node(u.from!, u.to!, { "data-block-selected": "true" }),
          );
        editor.view.dispatch(
          editor.state.tr
            .setMeta(
              selectionKey,
              DecorationSet.create(editor.state.doc, decorations),
            )
            .setMeta("addToHistory", false),
        );
      }
      selected = units;
      pane.dataset.blockSelection = units.length ? "true" : "";
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      if (drag && pane.hasPointerCapture(drag.pointerId))
        pane.releasePointerCapture(drag.pointerId);
      drag = undefined;
      overlay.remove();
      pane.removeAttribute("data-marquee-dragging");
    };
    const clear = () => {
      stop();
      paint([]);
    };
    const collect = (): Unit[] => {
      const { document: doc, note, editors } = latest.current;
      if (!doc || !note) return [];
      const result: Unit[] = [];
      const sections = new Map(
        [...pane.querySelectorAll<HTMLElement>("[data-writing-block]")].map(
          (s) => [s.dataset.writingBlock, s],
        ),
      );
      for (const id of note.blocks) {
        const section = sections.get(id);
        if (!section) continue;
        const editor = editors.current.get(id);
        const add = (
          element: HTMLElement,
          selection: SelectedBlock & { editor?: Editor },
        ) => {
          const rect = element.getBoundingClientRect(),
            bounds = pane.getBoundingClientRect();
          result.push({
            ...selection,
            element,
            left: rect.left - bounds.left + pane.scrollLeft,
            right: rect.right - bounds.left + pane.scrollLeft,
            top: rect.top - bounds.top + pane.scrollTop,
            bottom: rect.bottom - bounds.top + pane.scrollTop,
          });
        };
        if (editor && !editor.isDestroyed) {
          const snapshot = textSnapshot(editor);
          snapshot.doc.forEach((node, pos) => {
            const element = editor.view.nodeDOM(pos);
            if (element instanceof HTMLElement)
              add(element, {
                id,
                from: pos,
                to: pos + node.nodeSize,
                snapshot,
                editor,
              });
          });
        } else add(section, { id });
      }
      return result;
    };
    const tick = () => {
      if (!drag?.started) return;
      const bounds = pane.getBoundingClientRect();
      const edge = 40;
      const speed =
        drag.clientY < bounds.top + edge
          ? -Math.min(18, (bounds.top + edge - drag.clientY) / 3)
          : drag.clientY > bounds.bottom - edge
            ? Math.min(18, (drag.clientY - bounds.bottom + edge) / 3)
            : 0;
      if (speed) pane.scrollTop += speed;
      const x =
        Math.max(bounds.left, Math.min(bounds.right, drag.clientX)) -
        bounds.left +
        pane.scrollLeft;
      const y =
        Math.max(bounds.top, Math.min(bounds.bottom, drag.clientY)) -
        bounds.top +
        pane.scrollTop;
      const left = Math.min(x, drag.x),
        right = Math.max(x, drag.x),
        top = Math.min(y, drag.y),
        bottom = Math.max(y, drag.y);
      paint(
        drag.units.filter(
          (u) =>
            u.right > left &&
            u.left < right &&
            u.bottom > top &&
            u.top < bottom,
        ),
      );
      const visibleTop = Math.max(
        bounds.top,
        top - pane.scrollTop + bounds.top,
      );
      const visibleBottom = Math.min(
        bounds.bottom,
        bottom - pane.scrollTop + bounds.top,
      );
      Object.assign(overlay.style, {
        left: `${left - pane.scrollLeft + bounds.left}px`,
        top: `${visibleTop}px`,
        width: `${right - left}px`,
        height: `${Math.max(0, visibleBottom - visibleTop)}px`,
      });
      frame = requestAnimationFrame(tick);
    };
    const down = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (event.button !== 0 || event.pointerType === "touch") return;
      if (!pane.contains(target)) {
        clear();
        return;
      }
      // Only the document's empty gutters initiate a marquee. Editors, outline and controls keep their own gestures.
      if (
        !target.matches(
          ".notes-scroll,.writing-article,.writing-block,.writing-rich-frame",
        )
      ) {
        clear();
        return;
      }
      const article = pane.querySelector<HTMLElement>(".writing-article");
      if (!article) return;
      const rect = article.getBoundingClientRect(),
        style = getComputedStyle(article);
      const contentLeft = rect.left + parseFloat(style.paddingLeft),
        contentRight = rect.right - parseFloat(style.paddingRight);
      if (event.clientX >= contentLeft && event.clientX <= contentRight) {
        clear();
        return;
      }
      event.preventDefault();
      clear();
      const bounds = pane.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        x: event.clientX - bounds.left + pane.scrollLeft,
        y: event.clientY - bounds.top + pane.scrollTop,
        clientX: event.clientX,
        clientY: event.clientY,
        started: false,
        units: collect(),
        scrollTop: pane.scrollTop,
      };
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      const bounds = pane.getBoundingClientRect();
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      if (
        !drag.started &&
        Math.hypot(
          event.clientX - bounds.left + pane.scrollLeft - drag.x,
          event.clientY - bounds.top + drag.scrollTop - drag.y,
        ) > 4
      ) {
        drag.started = true;
        pane.setPointerCapture(drag.pointerId);
        document.getSelection()?.removeAllRanges();
        pane.focus({ preventScroll: true });
        pane.dataset.marqueeDragging = "true";
        document.body.append(overlay);
        frame = requestAnimationFrame(tick);
      }
      if (drag.started) event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      // A quick gesture can finish before the next animation frame.
      move(event);
      cancelAnimationFrame(frame);
      tick();
      stop();
    };
    const remove = () => {
      const { document: doc, note, edit } = latest.current;
      if (!doc || !note || !selected.length) return;
      edit(deleteSelected(doc, note, selected));
      clear();
      pane.focus({ preventScroll: true });
    };
    const key = (event: KeyboardEvent) => {
      if (
        (!selected.length && !drag) ||
        document.activeElement !== pane ||
        event.isComposing
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        clear();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          remove();
        } catch (error) {
          latest.current.onError((error as Error).message);
        }
      }
    };
    const copy = (event: ClipboardEvent) => {
      if (
        !selected.length ||
        document.activeElement !== pane ||
        !event.clipboardData
      )
        return;
      try {
        const { payload, plain } = encodeSelected(
          latest.current.document!,
          selected,
        );
        event.clipboardData.setData(BLOCK_CLIPBOARD, payload);
        event.clipboardData.setData("text/plain", plain);
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "cut") remove();
      } catch (error) {
        event.preventDefault();
        latest.current.onError((error as Error).message);
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", clear, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("copy", copy, true);
    document.addEventListener("cut", copy, true);
    window.addEventListener("blur", stop);
    return () => {
      clear();
      for (const editor of registered)
        if (!editor.isDestroyed) editor.unregisterPlugin(selectionKey);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", clear, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("copy", copy, true);
      document.removeEventListener("cut", copy, true);
      window.removeEventListener("blur", stop);
    };
  }, [options.note?.id, options.document?.revision]);
}
