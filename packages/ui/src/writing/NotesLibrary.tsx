import { documentDirectoryAvailable, documentRequest } from "@nomi/platform";
import { useWorkspace } from "../workspace-context";
import { useEffect, useRef, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { createPortal } from "react-dom";
import {
  noteAncestors,
  noteSubtreeIds,
  type CanvasDocument,
  type CanvasNote,
} from "@nomi/core";
import { NoteListItem } from "./NoteListItem";
import { useNoteTreeDrag } from "./useNoteTreeDrag";
import type { NoteDropMove } from "./note-drop";

export function NotesLibrary({
  profile,
  document,
  selected,
  query,
  onQuery,
  onChoose,
  onCreate,
  onMove,
  onDropMove,
  onDelete,
}: {
  profile: string;
  document: CanvasDocument;
  selected?: string;
  query: string;
  onQuery: (query: string) => void;
  onChoose: (id: string) => void;
  onCreate: (parentId?: string) => void;
  onMove: (id: string) => void;
  onDropMove: (id: string, move: NoteDropMove) => void;
  onDelete: (id: string) => void;
}) {
  const { notify } = useWorkspace();
  const notes = document.notes;
  const storageKey = `nomi:notes:${profile}:expanded`;
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return new Set(
        Array.isArray(saved)
          ? saved.filter((id) => typeof id === "string")
          : [],
      );
    } catch {
      return new Set();
    }
  });
  const nav = useRef<HTMLElement>(null);
  const path = selected
    ? noteAncestors(notes, selected)
        .map((note) => note.id)
        .join("/")
    : "";
  useEffect(() => {
    if (path)
      setExpanded((current) => new Set([...current, ...path.split("/")]));
  }, [path, selected]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch {
      /* Optional view preference. */
    }
  }, [expanded, storageKey]);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const treeDrag = useNoteTreeDrag(nav, notes, onDropMove, (id) =>
    setExpanded((current) =>
      current.has(id) ? current : new Set([...current, id]),
    ),
  );
  const groups = new Map<string | undefined, CanvasNote[]>();
  for (const note of notes)
    groups.set(note.parentId, [...(groups.get(note.parentId) || []), note]);
  const included = new Set<string>();
  if (query.trim()) {
    const needle = query.trim().toLocaleLowerCase();
    for (const note of notes) {
      const text = [
        note.title,
        ...note.blocks.map((id) => {
          const block = document.blocks.find((block) => block.id === id);
          return block?.type === "markdown" ? block.source : "";
        }),
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (text.includes(needle))
        for (const id of [
          note.id,
          ...noteAncestors(notes, note.id).map((n) => n.id),
        ])
          included.add(id);
    }
  }
  const rows: {
    note: CanvasNote;
    depth: number;
    open: boolean;
    children: boolean;
  }[] = [];
  const visit = (parentId: string | undefined, depth: number) => {
    for (const note of groups.get(parentId) || []) {
      if (query.trim() && !included.has(note.id)) continue;
      const open = !!query.trim() || expanded.has(note.id);
      rows.push({ note, depth, open, children: !!groups.get(note.id)?.length });
      if (open) visit(note.id, depth + 1);
    }
  };
  visit(undefined, 0);
  const focus = (id?: string) => {
    if (!id) return;
    const row = [
      ...(nav.current?.querySelectorAll<HTMLElement>("[data-note-row]") || []),
    ].find((row) => row.dataset.noteRow === id);
    row?.querySelector<HTMLButtonElement>(".notes-list-select")?.focus();
  };
  return (
    <aside className="notes-library" id="notes-library" aria-label="文稿列表">
      <header>
        <h1>文稿</h1>
        <button
          aria-label="新建文稿"
          title="新建文稿"
          onClick={() => onCreate()}
        >
          <Plus size={18} />
        </button>
      </header>
      <input
        className="notes-search"
        aria-label="搜索文稿"
        placeholder="搜索文稿…"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <nav
        ref={nav}
        role="tree"
        aria-label="文稿层级"
        data-tree-dragging={!!treeDrag.drag || undefined}
        data-root-drop={
          (treeDrag.drag?.drop && !treeDrag.drag.drop.row) || undefined
        }
        onPointerDown={treeDrag.onPointerDown}
        onClickCapture={treeDrag.onClickCapture}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (!(event.target as HTMLElement).closest(".notes-list-select"))
            return;
          const id = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-note-row]",
          )?.dataset.noteRow;
          const index = rows.findIndex((row) => row.note.id === id),
            row = rows[index];
          if (!row) return;
          if (event.key === "ArrowDown") focus(rows[index + 1]?.note.id);
          else if (event.key === "ArrowUp") focus(rows[index - 1]?.note.id);
          else if (event.key === "Home") focus(rows[0]?.note.id);
          else if (event.key === "End") focus(rows.at(-1)?.note.id);
          else if (event.key === "ArrowRight") {
            if (row.children && !row.open) toggle(row.note.id);
            else focus(groups.get(row.note.id)?.[0]?.id);
          } else if (event.key === "ArrowLeft") {
            if (row.children && row.open && !query.trim()) toggle(row.note.id);
            else focus(row.note.parentId);
          } else return;
          event.preventDefault();
        }}
      >
        {rows.map(({ note, depth, open, children }) => (
          <NoteListItem
            key={note.id}
            note={note}
            selected={note.id === selected}
            depth={depth}
            expanded={open}
            hasChildren={children}
            dragging={treeDrag.drag?.id === note.id}
            dropPosition={
              treeDrag.drag?.drop?.row === note.id
                ? treeDrag.drag.drop.position
                : undefined
            }
            dropDepth={
              treeDrag.drag?.drop?.move.parentId
                ? noteAncestors(notes, treeDrag.drag.drop.move.parentId)
                    .length + 1
                : 0
            }
            onToggle={() => toggle(note.id)}
            onChoose={() => onChoose(note.id)}
            onCreate={() => onCreate(note.id)}
            onMove={() => onMove(note.id)}
            onDelete={() => onDelete(note.id)}
            onReveal={
              documentDirectoryAvailable()
                ? (children) => {
                    void documentRequest("reveal-note", {
                      profile,
                      documentId: document.id,
                      id: note.id,
                      children,
                    }).catch((e) => notify(e.message));
                  }
                : undefined
            }
          />
        ))}
        {!rows.length && <p className="notes-search-empty">没有找到文稿</p>}
        <div className="notes-tree-end" aria-hidden="true" />
      </nav>
      {treeDrag.drag &&
        createPortal(
          <div
            className="notes-tree-drag-preview"
            style={{ left: treeDrag.drag.x + 14, top: treeDrag.drag.y + 14 }}
            aria-hidden="true"
          >
            <FileText size={15} />
            {treeDrag.drag.title}
          </div>,
          window.document.body,
        )}
    </aside>
  );
}

export function noteMoveTargets(notes: CanvasNote[], id: string) {
  const excluded = noteSubtreeIds(notes, id);
  return notes.filter((note) => !excluded.has(note.id));
}
