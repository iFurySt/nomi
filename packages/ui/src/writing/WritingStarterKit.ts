import StarterKit from "@tiptap/starter-kit";

// New paragraphs, list items and soft line breaks start with plain typing marks.
// Let the existing split commands handle structure, selection, history and IME;
// only disable inheritance, without stripping formatting from existing text.
export const WritingStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) =>
      extension.type === "mark"
        ? extension.extend({ keepOnSplit: false })
        : extension,
    );
  },
});
