import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { noteSubtreeIds, type CanvasNote } from "@nomi/core";
import {
  resolveNoteDrop,
  type NoteDropMove,
  type NoteDropPosition,
} from "./note-drop";

type Drop = { row?: string; position: NoteDropPosition; move: NoteDropMove };
type Drag = { id: string; title: string; x: number; y: number; drop?: Drop };
export function useNoteTreeDrag(
  nav: RefObject<HTMLElement | null>,
  notes: CanvasNote[],
  onMove: (id: string, move: NoteDropMove) => void,
  onExpand: (id: string) => void,
) {
  const [drag, setDrag] = useState<Drag>();
  const current = useRef({ notes, onMove, onExpand });
  current.current = { notes, onMove, onExpand };
  const session = useRef<
    | {
        id: string;
        pointer: number;
        x: number;
        y: number;
        active: boolean;
      }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);
  useEffect(() => {
    let frame = 0;
    let hoverId: string | undefined;
    let hoverAt = 0;
    let latest: Drag | undefined;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      session.current = undefined;
      cancelAnimationFrame(frame);
      hoverId = undefined;
      latest = undefined;
      setDrag(undefined);
      document.body.classList.remove("notes-tree-dragging");
    };
    const update = (x: number, y: number) => {
      const start = session.current,
        tree = nav.current;
      if (!start?.active || !tree) return;
      const { notes } = current.current;
      const source = notes.find((note) => note.id === start.id);
      if (!source) {
        clear();
        return;
      }
      let drop: Drop | undefined;
      const bounds = tree.getBoundingClientRect();
      if (
        x >= bounds.left &&
        x <= bounds.right &&
        y >= bounds.top &&
        y <= bounds.bottom
      ) {
        const row = document
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>("[data-note-row]");
        if (row && tree.contains(row)) {
          const rect = row.getBoundingClientRect();
          const ratio = (y - rect.top) / rect.height;
          const position =
            ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
          const targetId = row.dataset.noteRow!;
          const visible = [
            ...tree.querySelectorAll<HTMLElement>("[data-note-row]"),
          ];
          const nextVisible = visible[visible.indexOf(row) + 1];
          const move = resolveNoteDrop(
            notes,
            start.id,
            targetId,
            position,
            nextVisible?.dataset.noteRow,
          );
          if (move) {
            drop = { row: targetId, position, move };
          }
          // Expanding also works for a no-op drop onto the current parent.
          if (
            position === "inside" &&
            !noteSubtreeIds(notes, start.id).has(targetId) &&
            row.getAttribute("aria-expanded") === "false"
          ) {
            if (hoverId !== targetId) {
              hoverId = targetId;
              hoverAt = performance.now();
            } else if (performance.now() - hoverAt > 650)
              current.current.onExpand(targetId);
          } else hoverId = undefined;
        } else {
          hoverId = undefined;
          const last = [
            ...tree.querySelectorAll<HTMLElement>("[data-note-row]"),
          ].at(-1);
          if (!last || y > last.getBoundingClientRect().bottom) {
            const move = resolveNoteDrop(notes, start.id, null, "after");
            if (move) drop = { position: "after", move };
          }
        }
      } else hoverId = undefined;
      latest = {
        id: start.id,
        title: source.title || "未命名文稿",
        x,
        y,
        drop,
      };
      setDrag(latest);
    };
    const tick = () => {
      const tree = nav.current;
      if (!session.current?.active || !latest || !tree) return;
      const rect = tree.getBoundingClientRect();
      const { x, y } = latest;
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top - 24 &&
        y <= rect.bottom + 24
      ) {
        const delta =
          y < rect.top + 32
            ? -Math.min(12, (rect.top + 32 - y) / 3)
            : y > rect.bottom - 32
              ? Math.min(12, (y - rect.bottom + 32) / 3)
              : 0;
        if (delta) tree.scrollTop += delta;
      }
      update(x, y);
      frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      const start = session.current;
      if (!start || event.pointerId !== start.pointer) return;
      if (
        !start.active &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
      )
        return;
      if (!start.active) {
        start.active = true;
        nav.current?.setPointerCapture(event.pointerId);
        document.body.classList.add("notes-tree-dragging");
        window.getSelection()?.removeAllRanges();
        frame = requestAnimationFrame(tick);
      }
      event.preventDefault();
      update(event.clientX, event.clientY);
    };
    const finish = (event: PointerEvent) => {
      const start = session.current;
      if (!start || event.pointerId !== start.pointer) return;
      if (start.active) {
        update(event.clientX, event.clientY);
        const drop = latest?.drop;
        suppressClick.current = true;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        clear();
        if (drop && event.type === "pointerup")
          current.current.onMove(start.id, drop.move);
      } else clear();
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session.current) {
        event.preventDefault();
        event.stopPropagation();
        clear();
      }
    };
    const blur = () => clear();
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", cancel, true);
    window.addEventListener("blur", blur);
    return () => {
      clear();
      clearTimeout(clickTimer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("blur", blur);
    };
  }, [nav]);
  return {
    drag,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.pointerType === "touch") return;
      const button = (event.target as HTMLElement).closest(
        ".notes-list-select",
      );
      const id =
        button?.closest<HTMLElement>("[data-note-row]")?.dataset.noteRow;
      if (!id) return;
      session.current = {
        id,
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        active: false,
      };
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (suppressClick.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }
    },
  };
}
