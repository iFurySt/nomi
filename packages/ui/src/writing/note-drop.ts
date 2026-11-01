import { noteSubtreeIds, type CanvasNote } from "@nomi/core";

export type NoteDropPosition = "before" | "inside" | "after";
export type NoteDropMove = { parentId: string | null; before?: string };

/** Use visible adjacency for row boundaries, then order against all siblings. */
export function resolveNoteDrop(
  notes: CanvasNote[],
  sourceId: string,
  targetId: string | null,
  position: NoteDropPosition,
  nextVisibleId?: string,
): NoteDropMove | undefined {
  const source = notes.find((note) => note.id === sourceId);
  const hit = notes.find((note) => note.id === targetId);
  const nextVisible = notes.find((note) => note.id === nextVisibleId);
  // The lower edge of an expanded parent is the same gap as its child's top.
  const childBoundary =
    position === "after" && !!hit && nextVisible?.parentId === hit.id;
  const target = childBoundary ? nextVisible : hit;
  const intent = childBoundary ? "before" : position;
  if (!source || (targetId && !target)) return;
  const subtree = noteSubtreeIds(notes, sourceId);
  if (target && subtree.has(target.id)) return;
  const parentId = !target
    ? null
    : intent === "inside"
      ? target.id
      : (target.parentId ?? null);
  if (parentId && subtree.has(parentId)) return;
  const siblings = notes.filter(
    (note) => (note.parentId ?? null) === parentId && note.id !== sourceId,
  );
  const index = target
    ? siblings.findIndex((note) => note.id === target.id)
    : -1;
  const before =
    intent === "before" && target
      ? target.id
      : intent === "after" && index >= 0
        ? siblings[index + 1]?.id
        : undefined;
  if ((source.parentId ?? null) === parentId) {
    const oldSiblings = notes.filter(
      (note) => (note.parentId ?? null) === parentId,
    );
    const oldIndex = oldSiblings.findIndex((note) => note.id === sourceId);
    if (oldSiblings[oldIndex + 1]?.id === before) return;
  }
  return { parentId, ...(before ? { before } : {}) };
}
