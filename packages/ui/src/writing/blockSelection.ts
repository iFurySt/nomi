import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import {
  blockAssetIds,
  newCanvasId,
  parseCanvasDocument,
  type CanvasBlock,
  type CanvasCommand,
  type CanvasDocument,
  type CanvasNote,
} from "@nomi/core";
import type { TextSnapshot } from "./blockOperations";

export const BLOCK_CLIPBOARD = "application/x-nomi-blocks";
export type SelectedBlock = {
  id: string;
  from?: number;
  to?: number;
  snapshot?: TextSnapshot;
};

/** Markdown units are top-level nodes, so partial text, lists and tables remain valid. */
export function selectedContent(
  document: CanvasDocument,
  selection: SelectedBlock[],
) {
  const blocks: CanvasBlock[] = [];
  const removed: CanvasCommand[] = [];
  const detached = new Set<string>();
  for (const id of new Set(selection.map((s) => s.id))) {
    const block = document.blocks.find((b) => b.id === id);
    if (!block) throw Error("选中的内容已改变，请重新选择。");
    const units = selection.filter((s) => s.id === id),
      snapshot = units[0].snapshot;
    if (
      block.type !== "markdown" ||
      !snapshot ||
      units.some((s) => s.from === undefined)
    ) {
      blocks.push(structuredClone(block));
      detached.add(id);
      continue;
    }
    const chosen: PMNode[] = [],
      kept: PMNode[] = [];
    snapshot.doc.forEach((node, pos) => {
      (units.some((s) => s.from === pos) ? chosen : kept).push(node);
    });
    blocks.push({
      ...block,
      source: snapshot.serialize(snapshot.doc.copy(Fragment.fromArray(chosen))),
    });
    if (!kept.length) detached.add(id);
    else
      removed.push({
        type: "set_markdown",
        id,
        source: snapshot.serialize(snapshot.doc.copy(Fragment.fromArray(kept))),
      });
  }
  return { blocks, removed, detached };
}
export function deleteSelected(
  document: CanvasDocument,
  note: CanvasNote,
  selection: SelectedBlock[],
) {
  const { removed, detached } = selectedContent(document, selection);
  return [
    ...removed,
    {
      type: "set_note_blocks",
      id: note.id,
      blocks: note.blocks.filter((id) => !detached.has(id)),
    } as CanvasCommand,
  ];
}
export function encodeSelected(
  document: CanvasDocument,
  selection: SelectedBlock[],
) {
  const { blocks } = selectedContent(document, selection);
  const snapshot = parseCanvasDocument({
    schema: document.schema,
    id: document.id,
    title: "",
    revision: 1,
    notes: [],
    blocks,
    assets: document.assets.filter((a) =>
      blocks.some((b) => blockAssetIds(b).includes(a.id)),
    ),
    board: { id: "clipboard.board", placements: [] },
  });
  return {
    payload: JSON.stringify({ schema: "nomi-blocks/v1", document: snapshot }),
    plain: blocks
      .map((b) =>
        b.type === "markdown" ? b.source : JSON.stringify(b, null, 2),
      )
      .join("\n\n"),
  };
}
export function decodeSelected(
  text: string,
  document: CanvasDocument,
): CanvasBlock[] {
  if (text.length > 4_000_000) throw Error("复制的内容过大。");
  const raw = JSON.parse(text);
  if (raw.schema !== "nomi-blocks/v1") throw Error("无法读取复制的内容。");
  const snapshot = parseCanvasDocument(raw.document);
  for (const asset of snapshot.assets) {
    if (
      !document.assets.some(
        (a) => a.id === asset.id && a.sha256 === asset.sha256,
      )
    )
      throw Error("附件原件不在当前文稿库，请先导入原件。");
  }
  return snapshot.blocks.map((b) => ({ ...b, id: newCanvasId("block") }));
}
