import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";

export const isList = (node: PMNode) =>
  ["bulletList", "orderedList", "taskList"].includes(node.type.name);
export const isListItem = (node: PMNode) =>
  ["listItem", "taskItem"].includes(node.type.name);

/** A list item travels with its children and its source list style. */
export function textUnit(doc: PMNode, from: number, to: number) {
  const node = doc.nodeAt(from),
    $from = doc.resolve(from);
  if (
    node &&
    isListItem(node) &&
    isList($from.parent) &&
    from + node.nodeSize === to
  ) {
    const list = $from.parent;
    const attrs = { ...list.attrs };
    if (list.type.name === "orderedList") attrs.start += $from.index();
    return {
      content: Fragment.from(list.type.create(attrs, node)),
      from: list.childCount === 1 ? $from.before() : from,
      to: list.childCount === 1 ? $from.after() : to,
    };
  }
  return { content: doc.content.cut(from, to), from, to };
}

/** Fit textual units into list boundaries, adapting item wrappers to the target. */
export function insertText(doc: PMNode, at: number, content: Fragment) {
  const parent = doc.resolve(at).parent;
  if (isList(parent)) {
    const itemType =
      doc.type.schema.nodes[
        parent.type.name === "taskList" ? "taskItem" : "listItem"
      ];
    const items: PMNode[] = [];
    const append = (node: PMNode) => {
      const body = isListItem(node) ? node.content : Fragment.from(node);
      const item = itemType.createAndFill(
        isListItem(node) ? node.attrs : null,
        body,
      );
      if (!item) throw Error("这里无法放入当前内容。");
      items.push(item);
    };
    content.forEach((node) =>
      isList(node) ? node.forEach(append) : append(node),
    );
    content = Fragment.fromArray(items);
  }
  const result = new Transform(doc).insert(at, content).doc;
  result.check();
  return result;
}

/** Slice only structural boundaries, discarding empty list shells on either side. */
export function cutText(doc: PMNode, from: number, to: number): PMNode {
  const clean = (node: PMNode): PMNode | null => {
    if (node.isLeaf) return node;
    const children: PMNode[] = [];
    node.forEach((child) => {
      const kept = clean(child);
      if (kept) children.push(kept);
    });
    if ((isList(node) || isListItem(node)) && !children.length) return null;
    const content = Fragment.fromArray(children);
    return node.type.validContent(content)
      ? node.copy(content)
      : node.type.createAndFill(node.attrs, content);
  };
  const fragment = doc.content.cut(from, to),
    children: PMNode[] = [];
  fragment.forEach((node) => {
    const kept = clean(node);
    if (kept) children.push(kept);
  });
  return doc.copy(Fragment.fromArray(children));
}

export function moveText(doc: PMNode, from: number, to: number, at: number) {
  const unit = textUnit(doc, from, to);
  const removed = new Transform(doc).delete(unit.from, unit.to);
  return insertText(removed.doc, removed.mapping.map(at), unit.content);
}

export function removeText(doc: PMNode, from: number, to: number) {
  const unit = textUnit(doc, from, to);
  return new Transform(doc).delete(unit.from, unit.to).doc;
}
