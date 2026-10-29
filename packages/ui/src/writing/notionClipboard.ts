import { Fragment, Slice, type Node, type Schema } from "@tiptap/pm/model";

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const types: Record<string, string> = {
  text: "paragraph",
  header: "heading1",
  sub_header: "heading2",
  sub_sub_header: "heading3",
  bulleted_list: "bulletList",
  numbered_list: "orderedList",
  to_do: "taskList",
  quote: "blockquote",
  code: "codeBlock",
};

/** Notion omits blank text blocks from HTML, but retains them in its v3 payload.
 * Match that ordered payload to the already parsed HTML; reuse its nodes/marks.
 * Unknown structures and partial/mismatching selections keep the normal paste.
 */
export function restoreNotionBlanks(
  raw: string,
  slice: Slice,
  schema: Schema,
): Slice | null {
  if (!raw || raw.length > 4_000_000) return null;
  try {
    const entries = record(JSON.parse(raw))?.blocks;
    if (!Array.isArray(entries) || !entries.length || entries.length > 10_000)
      return null;
    const blocks: { kind: string; text: string; blank: boolean }[] = [];
    for (const entry of entries) {
      const item = record(entry),
        subtree = record(item?.blockSubtree),
        map = record(subtree?.block),
        value = record(record(map?.[String(item?.blockId)])?.value);
      if (!value || value.alive === false || typeof value.type !== "string")
        return null;
      const kind = types[value.type];
      if (!kind) return null;
      const title = record(value.properties)?.title;
      if (title !== undefined && !Array.isArray(title)) return null;
      let text = "";
      for (const run of title ?? []) {
        if (!Array.isArray(run) || typeof run[0] !== "string") return null;
        text += run[0];
      }
      // Nested source blocks require their own alignment. Leave them to HTML.
      if (Array.isArray(value.content) && value.content.length) return null;
      blocks.push({ kind, text, blank: kind === "paragraph" && text === "" });
    }
    if (!blocks.some((block) => block.blank)) return null;
    const atoms: { node: Node; wrapper?: Node; index?: number }[] = [];
    slice.content.forEach((node) => {
      if (["bulletList", "orderedList", "taskList"].includes(node.type.name))
        node.forEach((child, _offset, index) =>
          atoms.push({ node: child, wrapper: node, index }),
        );
      else atoms.push({ node });
    });
    // Existing blank HTML or a forced plain-text paste already has its own lines.
    if (
      atoms.some(
        ({ node }) => node.type.name === "paragraph" && !node.content.size,
      )
    )
      return null;
    if (atoms.length !== blocks.filter((block) => !block.blank).length)
      return null;
    const result: Node[] = [];
    let cursor = 0;
    let previousWrapper: Node | undefined;
    for (const block of blocks) {
      if (block.blank) {
        result.push(schema.nodes.paragraph.create());
        previousWrapper = undefined;
        continue;
      }
      const atom = atoms[cursor++],
        node = atom.wrapper ?? atom.node,
        kind =
          node.type.name === "heading"
            ? `heading${node.attrs.level}`
            : node.type.name;
      if (kind !== block.kind) return null;
      // Mentions and link previews use a placeholder in Notion's rich-text title.
      if (
        !/[\u2023\ufffc]/u.test(block.text) &&
        normalize(block.text) !== normalize(atom.node.textContent)
      )
        return null;
      if (atom.wrapper) {
        if (previousWrapper === atom.wrapper) {
          const last = result[result.length - 1];
          result[result.length - 1] = last.copy(
            last.content.append(Fragment.from(atom.node)),
          );
        } else {
          const attrs = { ...atom.wrapper.attrs };
          if (atom.wrapper.type.name === "orderedList")
            attrs.start = Number(attrs.start ?? 1) + (atom.index ?? 0);
          result.push(atom.wrapper.type.create(attrs, atom.node));
        }
        previousWrapper = atom.wrapper;
      } else {
        result.push(atom.node);
        previousWrapper = undefined;
      }
    }
    return Slice.maxOpen(Fragment.fromArray(result));
  } catch {
    return null;
  }
}

export function notionClipboardData(data: DataTransfer | null): string {
  const type =
    data &&
    Array.from(data.types).find((type) =>
      /^text\/_notion-blocks-v3-/.test(type),
    );
  return type ? data!.getData(type) : "";
}
