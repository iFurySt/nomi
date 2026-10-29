// Tiptap serializes multiline GFM cells with a plain <br>. This exact spelling
// is represented by hardBreak; other HTML must keep the protected-source path.
export function withoutTableBreaks(source: string) {
  return source
    .split("\n")
    .map((line) =>
      /^\s*\|.*\|\s*$/.test(line) ? line.replace(/<br\s*\/?>/gi, "") : line,
    )
    .join("\n");
}
type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };
export function remarkTableBreaks() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode, inCell = false) => {
      if (
        inCell &&
        node.type === "html" &&
        /^<br\s*\/?>$/i.test(node.value ?? "")
      ) {
        node.type = "break";
        delete node.value;
      }
      node.children?.forEach((child) =>
        visit(child, inCell || node.type === "tableCell"),
      );
    };
    visit(tree);
  };
}
