import type { Node, Fragment } from "@tiptap/pm/model";
import { readMathSource } from "./mathSource";
import { unwrapMath } from "./mathDelimiters";

export function formulaText(latex: string, block = false) {
  const source = unwrapMath(readMathSource(latex).latex);
  return block ? `\\[${source}\\]` : `\\(${source}\\)`;
}

// Preserve formula syntax when copying an atom or a mixed text/table selection.
export function mathClipboardText(content: Fragment, separator = "\n\n") {
  return content.textBetween(0, content.size, separator, (node: Node) => {
    if (node.type.name === "inlineMath" || node.type.name === "blockMath")
      return formulaText(node.attrs.latex, node.type.name === "blockMath");
    if (node.type.name === "hardBreak") return "\n";
    return node.type.spec.leafText?.(node) ?? "";
  });
}
