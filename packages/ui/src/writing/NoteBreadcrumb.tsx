import { useLayoutEffect, useRef } from "react";
import { noteAncestors, type CanvasNote } from "@nomi/core";
import type { CanvasRepository } from "@nomi/platform";
import { NoteIcon } from "./NoteIcon";

export function NoteBreadcrumb({
  notes,
  note,
  repository,
  onChoose,
}: {
  notes: CanvasNote[];
  note: CanvasNote;
  repository: CanvasRepository;
  onChoose: (id: string) => void;
}) {
  const viewport = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    // Keep the current page visible in deep paths; ancestors remain scrollable.
    const element = viewport.current;
    if (!element) return;
    const revealCurrent = () => {
      element.scrollLeft = element.scrollWidth;
    };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(element);
    return () => observer.disconnect();
  }, [note.id, notes]);
  const path = [...noteAncestors(notes, note.id), note];
  return (
    <nav className="notes-breadcrumb" aria-label="文稿路径" ref={viewport}>
      <ol>
        {path.map((entry, index) => {
          const title = entry.title || "未命名文稿";
          const content = (
            <>
              {entry.icon && <NoteIcon note={entry} repository={repository} />}
              <span className="notes-breadcrumb-title">{title}</span>
            </>
          );
          return (
            <li key={entry.id}>
              {index > 0 && (
                <span className="notes-breadcrumb-separator" aria-hidden="true">
                  /
                </span>
              )}
              {entry.id === note.id ? (
                <span
                  className="notes-breadcrumb-current"
                  aria-current="page"
                  title={title}
                >
                  {content}
                </span>
              ) : (
                <button
                  type="button"
                  title={title}
                  onClick={() => onChoose(entry.id)}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
