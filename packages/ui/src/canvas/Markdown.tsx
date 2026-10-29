import { memo, useDeferredValue } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkMathAlignment } from "../writing/mathSource";
import { remarkTableBreaks } from "../writing/tableMarkdown";
import "../writing/math.css";
import { MarkdownCodeBlock } from "../writing/CodeContent";
import "katex/dist/katex.min.css";
const mathOptions = {
  trust: false,
  strict: "error",
  throwOnError: false,
  maxExpand: 200,
  maxSize: 10,
};
export const Markdown = memo(function Markdown({ source }: { source: string }) {
  const value = useDeferredValue(source);
  return (
    <div className="canvas-markdown">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          remarkMathAlignment,
          remarkTableBreaks,
        ]}
        rehypePlugins={[[rehypeKatex, mathOptions]]}
        components={{
          pre: MarkdownCodeBlock,
          img: ({ alt }) => (
            <span className="canvas-inline-image-hint">
              {alt || "图片"}（请通过图片工具添加原件）
            </span>
          ),
          a: ({ href, children }) =>
            /^(https?:|mailto:)/i.test(href ?? "") ? (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
});
