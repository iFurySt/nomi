export type MathAlignment = "left" | "center" | "right";

// A LaTeX comment keeps layout metadata alongside the formula without HTML or
// a second source of truth. Other Markdown/LaTeX readers can still render it.
export function readMathSource(source: string) {
  const match = source.match(/^\s*% nomi-align: (left|center|right)\r?\n/);
  return {
    latex: match ? source.slice(match[0].length) : source,
    alignment: (match?.[1] ?? "center") as MathAlignment,
  };
}
export function writeMathSource(latex: string, alignment: MathAlignment) {
  const clean = readMathSource(latex).latex;
  return alignment === "center"
    ? clean
    : `% nomi-align: ${alignment}\n${clean}`;
}

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
};
export function remarkMathAlignment() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.type === "math") {
        // remark-math's code child is retained for rehype-katex. The wrapper
        // survives KaTeX's replacement of that child, including in offline pages.
        node.data = {
          ...node.data,
          hName: "div",
          hProperties: {
            className: ["nomi-math-block"],
            "data-math-align": readMathSource(node.value ?? "").alignment,
          },
        };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
