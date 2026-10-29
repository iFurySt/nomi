import type { CanvasBlock, CanvasDocument, CanvasNote } from "@nomi/core";
export type WritingRow = {
  block: CanvasBlock;
  after?: string;
  draft?: boolean;
  emptyPeers?: string[];
};
/** Empty text positions are view state until the first keystroke; no read-time migration. */
export function writingRows(
  document: CanvasDocument,
  note: CanvasNote,
  draftId: (after: string) => string,
): WritingRow[] {
  const rows: WritingRow[] = [];
  const gap = (after: string) =>
    rows.push({
      block: { id: draftId(after), type: "markdown", source: "" },
      after,
      draft: true,
    });
  let previous: CanvasBlock | undefined;
  for (const id of note.blocks) {
    const block = document.blocks.find((b) => b.id === id)!;
    if (
      block.type === "markdown" &&
      !block.source.trim() &&
      previous?.type === "markdown" &&
      !previous.source.trim()
    ) {
      const row = rows.at(-1)!;
      row.emptyPeers = [...(row.emptyPeers ?? []), id];
      continue;
    }
    if (block.type !== "markdown" && previous?.type !== "markdown")
      gap(previous?.id ?? "");
    rows.push({ block });
    previous = block;
  }
  if (previous?.type !== "markdown") gap(previous?.id ?? "");
  return rows;
}
