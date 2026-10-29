import { describe, expect, it } from "vitest";
import { codeHighlight } from "./highlight";
describe("code highlighting boundary", () => {
  it("keeps unknown languages and very large snippets as literal text", () => {
    const source = '<img src=x onerror="alert(1)">';
    expect(
      codeHighlight.highlight("unknown-language", source).children,
    ).toEqual([{ type: "text", value: source }]);
    const big = "const value = 1;\n".repeat(4000);
    expect(codeHighlight.highlightAuto(big).children).toEqual([
      { type: "text", value: big },
    ]);
  });
  it("recognizes language aliases used by Markdown fences", () => {
    expect(codeHighlight.registered("js")).toBe(true);
    expect(codeHighlight.registered("py")).toBe(true);
    expect(
      JSON.stringify(
        codeHighlight.highlight("js", 'const label = "Nomi";').children,
      ),
    ).toContain("hljs-keyword");
  });
});
