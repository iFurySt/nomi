import { describe, it, expect } from "vitest";
import { Schema, Fragment } from "@tiptap/pm/model";
import { formulaText, mathClipboardText } from "./mathClipboard";
import { writeMathSource } from "./mathSource";
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    inlineMath: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { latex: { default: "" } },
    },
    blockMath: {
      group: "block",
      atom: true,
      attrs: { latex: { default: "" } },
    },
  },
});
describe("formula clipboard source", () => {
  it("uses portable delimiters without layout metadata or double wrapping", () => {
    expect(formulaText("Q")).toBe("\\(Q\\)");
    expect(formulaText("\\(Q\\)")).toBe("\\(Q\\)");
    expect(formulaText(writeMathSource("Q", "right"), true)).toBe("\\[Q\\]");
  });
  it("preserves math in selections mixing text and formulas", () => {
    const p = schema.node("paragraph", null, [
      schema.text("Query "),
      schema.node("inlineMath", { latex: "Q" }),
      schema.text(" and key"),
    ]);
    expect(mathClipboardText(Fragment.from(p))).toBe("Query \\(Q\\) and key");
    expect(
      mathClipboardText(
        Fragment.from(schema.node("blockMath", { latex: "x^2" })),
      ),
    ).toBe("\\[x^2\\]");
  });
});
