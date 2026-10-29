import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  cutText,
  insertText,
  moveText,
  removeText,
  textUnit,
} from "./textStructure";
import {
  newCanvasId,
  type CanvasBlock,
  type CanvasCommand,
  type CanvasDocument,
  type CanvasNote,
} from "@nomi/core";

export type BlockPoint = {
  id: string;
  pos?: number;
  after?: boolean;
  replaceTo?: number;
};
export type BlockDrag = BlockPoint & { end?: number; revision: number };
export type TextSnapshot = { doc: PMNode; serialize: (node: PMNode) => string };
export function textSnapshot(editor: Editor): TextSnapshot {
  return {
    doc: editor.state.doc,
    serialize: (node) =>
      editor.markdown!.serialize(node.toJSON() as JSONContent),
  };
}
function textBlock(source: string): CanvasBlock {
  return { id: newCanvasId("text"), type: "markdown", source };
}
function setText(id: string, source: string): CanvasCommand {
  return { type: "set_markdown", id, source };
}
function cut(snapshot: TextSnapshot, from: number, to: number) {
  return cutText(snapshot.doc, from, to);
}
/** Add at a top-level text boundary, splitting only the touched Markdown block. */
export function insertAt(
  document: CanvasDocument,
  note: CanvasNote,
  point: BlockPoint,
  block: CanvasBlock,
  snapshots: Map<string, TextSnapshot>,
  initialOrder = note.blocks,
): CanvasCommand[] {
  const order = [...initialOrder],
    commands: CanvasCommand[] = [];
  const index = order.indexOf(point.id);
  if (index < 0) throw Error("插入位置已改变，请重新选择。");
  const text = snapshots.get(point.id);
  let at = index + (point.after ? 1 : 0);
  if (point.pos !== undefined && text) {
    if (point.pos < 0 || point.pos > text.doc.content.size)
      throw Error("插入位置已改变。");
    const end = point.replaceTo ?? point.pos;
    if (point.replaceTo !== undefined) {
      const replaced = text.doc.nodeAt(point.pos);
      if (
        replaced?.type.name !== "paragraph" ||
        replaced.content.size !== 0 ||
        point.pos + replaced.nodeSize !== end
      )
        throw Error("空行已改变，请重新选择。");
    }
    if (point.pos === 0 && end === text.doc.content.size && end > 0) {
      order.splice(index, 1);
      at = index;
    } else if (point.pos === 0) {
      if (end > 0)
        commands.push(
          setText(
            point.id,
            text.serialize(cut(text, end, text.doc.content.size)),
          ),
        );
      at = index;
    } else if (end === text.doc.content.size) {
      if (end > point.pos)
        commands.push(
          setText(point.id, text.serialize(cut(text, 0, point.pos))),
        );
      at = index + 1;
    } else {
      const head = cut(text, 0, point.pos),
        tail = cut(text, end, text.doc.content.size);
      const rest = textBlock(text.serialize(tail));
      if (!head.content.size) {
        commands.push(setText(point.id, text.serialize(tail)));
        at = index;
      } else if (!tail.content.size) {
        commands.push(setText(point.id, text.serialize(head)));
        at = index + 1;
      } else {
        commands.push(setText(point.id, text.serialize(head)), {
          type: "add_block",
          block: rest,
        });
        order.splice(index + 1, 0, rest.id);
        at = index + 1;
      }
    }
  }
  if (!document.blocks.some((b) => b.id === block.id))
    commands.push({ type: "add_block", block });
  order.splice(at, 0, block.id);
  commands.push({ type: "set_note_blocks", id: note.id, blocks: order });
  return commands;
}

export function moveBlock(
  document: CanvasDocument,
  note: CanvasNote,
  source: BlockDrag,
  target: BlockPoint,
  snapshots: Map<string, TextSnapshot>,
): CanvasCommand[] {
  if (document.revision !== source.revision)
    throw Error("拖动期间文稿已改变，请重试。");
  const original = document.blocks.find((b) => b.id === source.id);
  if (!original || !note.blocks.includes(source.id)) return [];
  const text = snapshots.get(source.id);
  if (source.pos !== undefined && source.end !== undefined && text) {
    const { pos: from, end: to } = source;
    if (source.id === target.id && target.pos !== undefined) {
      if (target.pos >= from && target.pos <= to) return [];
      const moved = moveText(text.doc, from, to, target.pos);
      if (moved.eq(text.doc)) return [];
      return [setText(source.id, text.serialize(moved))];
    }
    // Moving the sole node keeps its content identity and all shared references.
    const unit = textUnit(text.doc, from, to);
    if (unit.from !== 0 || unit.to !== text.doc.content.size) {
      const remaining = removeText(text.doc, from, to);
      const destination = snapshots.get(target.id);
      if (destination && target.pos !== undefined)
        return [
          setText(source.id, text.serialize(remaining)),
          setText(
            target.id,
            destination.serialize(
              insertText(destination.doc, target.pos, unit.content),
            ),
          ),
        ];
      const fragment = textBlock(text.serialize(text.doc.copy(unit.content)));
      return [
        setText(source.id, text.serialize(remaining)),
        ...insertAt(document, note, target, fragment, snapshots),
      ];
    }
  }
  if (source.id === target.id) return [];
  return insertAt(
    document,
    note,
    target,
    original,
    snapshots,
    note.blocks.filter((id) => id !== source.id),
  );
}
