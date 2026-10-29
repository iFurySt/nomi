import {
  Fragment,
  Slice,
  type ResolvedPos,
  type Schema,
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
