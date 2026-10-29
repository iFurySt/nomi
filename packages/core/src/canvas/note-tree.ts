import type { CanvasNote } from "./document";

/** IDs of the selected note and its descendants, independent of array order. */
export function noteSubtreeIds(notes: CanvasNote[], id: string) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const note of notes)
      if (note.parentId && ids.has(note.parentId) && !ids.has(note.id)) {
        ids.add(note.id);
        changed = true;
      }
  }
  return ids;
}
export function noteAncestors(notes: CanvasNote[], id: string) {
  const ancestors: CanvasNote[] = [];
  const seen = new Set([id]);
  let parent = notes.find((note) => note.id === id)?.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const note = notes.find((note) => note.id === parent);
    if (!note) break;
    ancestors.unshift(note);
    parent = note.parentId;
  }
  return ancestors;
}
