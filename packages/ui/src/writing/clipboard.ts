import { mathTextParts } from "./mathDelimiters";
import {
  Fragment,
  Slice,
  type ResolvedPos,
  type Schema,
  type Node as PMNode,
} from "@tiptap/pm/model";

/** Rich clipboard producers use empty divs for blank paragraphs; PM ignores those by default. */
export function normalizeClipboardHTML(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const div of document.body.querySelectorAll("div")) {
    if (
      div.textContent?.trim() ||
      div.hasAttribute("data-type") ||
      div.hasAttribute("data-pm-slice") ||
      div.closest("pre, table, li, [contenteditable=false]") ||
      div.querySelector(
        "div, p, h1, h2, h3, h4, h5, h6, ul, ol, table, pre, blockquote, img, hr",
      )
    )
      continue;
    const paragraph = document.createElement("p");
    paragraph.append(...div.childNodes);
    div.replaceWith(paragraph);
  }
  return document.body.innerHTML;
}

/** Keep every plain-text line, including blank ones. Code blocks retain their native paste behavior. */
export function plainTextSlice(
  text: string,
  context: ResolvedPos,
  schema: Schema,
): Slice | null {
  if (context.parent.type.spec.code) return null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return Slice.maxOpen(
    Fragment.fromArray(
      lines.map((line) =>
        schema.nodes.paragraph.create(
          null,
          line ? schema.text(line, context.marks()) : undefined,
        ),
      ),
    ),
  );
}

/** Convert explicit math in rich tables/prose without guessing plain letters or code. */
export function recognizePastedMath(slice: Slice, schema: Schema): Slice {
  const math = schema.nodes.inlineMath;
  if (!math) return slice;
  const visit = (node: PMNode): PMNode[] => {
    if (node.type.spec.code || node.marks.some((mark) => mark.type.spec.code))
      return [node];
    if (node.isText)
      return mathTextParts(node.text!).map((part) =>
        part.latex === undefined
          ? schema.text(part.text, node.marks)
          : math.create({ latex: part.latex }, null, node.marks),
      );
    if (node.isLeaf) return [node];
    const children: PMNode[] = [];
    node.forEach((child) => children.push(...visit(child)));
    return [node.copy(Fragment.fromArray(children))];
  };
  const nodes: PMNode[] = [];
  slice.content.forEach((node) => nodes.push(...visit(node)));
  return new Slice(Fragment.fromArray(nodes), slice.openStart, slice.openEnd);
}
