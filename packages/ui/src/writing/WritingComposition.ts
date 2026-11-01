import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const WritingComposition = Extension.create({
  name: "writingComposition",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("writingComposition"),
        filterTransaction: (transaction) => {
          // ProseMirror probes Backspace keymaps while reading an IME deletion
          // from the DOM. Tiptap's unsuccessful commands still dispatch empty
          // transactions. Updating the view with that stale state rewrites the
          // composing text before the actual deletion is applied, cancelling
          // Chromium's marked range. Only discard these semantic no-ops;
          // content, selection, marks and metadata transactions still apply.
          return (
            !this.editor.view.composing ||
            transaction.docChanged ||
            transaction.selectionSet ||
            transaction.storedMarksSet ||
            !transaction.isGeneric
          );
        },
      }),
    ];
  },
});
