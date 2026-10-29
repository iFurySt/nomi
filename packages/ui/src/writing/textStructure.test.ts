import { describe, expect, it } from "vitest";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import {
  cutText,
  isListItem,
  moveText,
  textUnit,
  insertText,
  removeText,
} from "./textStructure";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: {},
    paragraph: { group: "block", content: "text*" },
    bulletList: { group: "block", content: "listItem+" },
    orderedList: {
      group: "block",
      content: "listItem+",
      attrs: { start: { default: 1 } },
    },
    listItem: { content: "paragraph block*" },
    taskList: { group: "block", content: "taskItem+" },
    taskItem: {
      content: "paragraph block*",
      attrs: { checked: { default: false } },
    },
  },
});
const p = (text: string) =>
  schema.node("paragraph", null, text ? schema.text(text) : undefined);
const item = (text: string, ...nested: PMNode[]) =>
  schema.node("listItem", null, [p(text), ...nested]);
const ul = (...items: PMNode[]) => schema.node("bulletList", null, items);
const ol = (...items: PMNode[]) => schema.node("orderedList", null, items);
const doc = (...nodes: PMNode[]) => schema.node("doc", null, nodes);
function find(doc: PMNode, text: string) {
  let result = { from: -1, to: -1 };
  doc.descendants((node, pos) => {
    if (isListItem(node) && node.firstChild?.textContent === text)
      result = { from: pos, to: pos + node.nodeSize };
  });
  if (result.from < 0) throw Error("Missing item " + text);
  return result;
}
function move(source: PMNode, text: string, target: string, after = false) {
  const unit = find(source, text),
    at = find(source, target);
  const result = moveText(source, unit.from, unit.to, after ? at.to : at.from);
  result.check();
  return result;
}
describe("list item structural moves", () => {
  for (const list of [ul, ol])
    it("reorders one item within " + list.name, () => {
      const result = move(
        doc(list(item("A"), item("B"), item("C"))),
        "A",
        "C",
        true,
      );
      expect(result.firstChild?.childCount).toBe(3);
      expect(result.textContent).toBe("BCA");
    });
  it("moves across list types and removes the last item's empty source list", () => {
    const result = move(
      doc(ul(item("A")), p("separator"), ol(item("X"), item("Y"))),
      "A",
      "Y",
    );
    expect(result.childCount).toBe(2);
    expect(result.lastChild?.type.name).toBe("orderedList");
    expect(result.lastChild?.textContent).toBe("XAY");
  });
  it("carries children with a parent and can move a nested child independently", () => {
    const source = doc(ul(item("A", ul(item("N"))), item("B")));
    const parent = move(source, "A", "B", true);
    expect(parent.textContent).toBe("BAN");
    expect(parent.firstChild?.lastChild?.lastChild?.type.name).toBe(
      "bulletList",
    );
    const child = move(source, "N", "B", true);
    expect(child.textContent).toBe("ABN");
    expect(child.firstChild?.childCount).toBe(3);
    expect(child.firstChild?.firstChild?.childCount).toBe(1);
  });
  it("retains item style when moving into body and adapts task items at destination", () => {
    const source = doc(ol(item("A"), item("B")), p("body"));
    const a = find(source, "A");
    const result = moveText(source, a.from, a.to, source.child(0).nodeSize);
    result.check();
    expect(result.childCount).toBe(3);
    expect(result.child(1).type.name).toBe("orderedList");
    const tasks = doc(
      schema.node(
        "taskList",
        null,
        schema.node("taskItem", { checked: true }, p("T")),
      ),
    );
    const content = textUnit(source, a.from, a.to).content;
    const inserted = insertText(tasks, 1, content);
    expect(inserted.firstChild?.firstChild?.type.name).toBe("taskItem");
    expect(inserted.firstChild?.firstChild?.attrs.checked).toBe(false);
    expect(inserted.firstChild?.lastChild?.attrs.checked).toBe(true);
  });
  it("cuts at item boundaries without leaving invalid empty list shells", () => {
    const source = doc(ul(item("A"), item("B")), p("body"));
    const first = find(source, "A"),
      last = find(source, "B");
    expect(cutText(source, 0, first.from).content.size).toBe(0);
    const tail = cutText(source, last.to, source.content.size);
    expect(tail.childCount).toBe(1);
    tail.check();
    const remaining = removeText(source, first.from, first.to);
    remaining.check();
    expect(remaining.textContent).toBe("Bbody");
  });
});
