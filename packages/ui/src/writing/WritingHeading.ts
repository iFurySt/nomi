import Heading from "@tiptap/extension-heading";

// An empty heading is still a heading. StarterKit serializes it as an empty
// string, losing the selected block type on shared undo/redo or reopening.
export const WritingHeading = Heading.extend({
  renderMarkdown: (node, helpers) =>
    `${"#".repeat(Number(node.attrs?.level) || 1)} ${helpers.renderChildren(node.content ?? [])}`,
});
