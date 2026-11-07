import type { Editor } from "@tiptap/core";
import {
  newCanvasId,
  type CanvasBlock,
  type CanvasDocument,
  type CanvasNote,
  type NoteGenerationContext,
} from "@nomi/core";
import type { WritingRow } from "./writingRows";

export type NoteAIRange = { from: number; to: number };
const nearby = (block?: CanvasBlock) =>
  block?.type === "markdown" ? block.source : block ? `[${block.type}]` : "";
/** Explicit, bounded context from this note only. Assets and other notes are never read. */
export function noteAIContext(
  document: CanvasDocument,
  note: CanvasNote,
  row: WritingRow,
  editor: Editor,
  range: NoteAIRange,
): NoteGenerationContext {
  const index = row.draft
    ? row.after
      ? note.blocks.indexOf(row.after) + 1
      : 0
    : note.blocks.indexOf(row.block.id);
  const blocks = new Map(document.blocks.map((b) => [b.id, b]));
  let before = editor.state.doc.textBetween(0, range.from, "\n").slice(-1500);
  let after = editor.state.doc
    .textBetween(range.to, editor.state.doc.content.size, "\n")
    .slice(0, 1500);
  for (let i = index - 1; i >= 0 && before.length < 1500; i--)
    before = (
      nearby(blocks.get(note.blocks[i])).slice(-1500) +
      "\n" +
      before
    ).slice(-1500);
  for (
    let i = index + (row.draft ? 0 : 1);
    i < note.blocks.length && after.length < 1500;
    i++
  )
    after = (
      after +
      "\n" +
      nearby(blocks.get(note.blocks[i])).slice(0, 1500)
    ).slice(0, 1500);
  return {
    title: note.title.slice(0, 256),
    selected: editor.state.doc
      .textBetween(range.from, range.to, "\n")
      .slice(0, 4000),
    before,
    after,
  };
}

/** Preserve native experiments/prose; diagrams remain an editable embedded canvas. */
export function generatedNoteBlocks(scene: CanvasDocument): CanvasBlock[] {
  if (
    scene.blocks.some((b) => b.type === "shape") ||
    scene.board.connectors?.length
  ) {
    return [{ id: newCanvasId("canvas"), type: "canvas", scene }];
  }
  return scene.blocks.map((b) => ({ ...b, id: newCanvasId("ai") }));
}
