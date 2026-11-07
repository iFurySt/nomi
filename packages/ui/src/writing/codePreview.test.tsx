import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { MarkdownCodeBlock } from "./CodeContent";
import { remarkCodeMetadata } from "./codeMetadata";
describe("read-only code preview", () => {
  it("uses saved caption and wrapping without treating controls as source", () => {
    const html = renderToStaticMarkup(
      <ReactMarkdown
        remarkPlugins={[remarkCodeMetadata]}
        components={{ pre: MarkdownCodeBlock }}
      >
        {'```ts nomi={"caption":"Demo","wrap":true}\nconst a = 1;\n```'}
      </ReactMarkdown>,
    );
    expect(html).toContain('value="Demo"');
    expect(html).toContain('data-wrap="true"');
    expect(html).toContain("TypeScript");
    expect(html).toContain("hljs-keyword");
    expect(html).not.toContain("nomi=");
  });
});
