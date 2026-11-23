// The Markdown AST retains source positions so a tap can resume native editing
// in the corresponding block, even when punctuation is absent from the preview.
import React from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathMarkdown } from "../../../packages/ui/src/writing/mathDelimiters";
import { remarkMathAlignment } from "../../../packages/ui/src/writing/mathSource";
import { remarkTableBreaks } from "../../../packages/ui/src/writing/tableMarkdown";

function sourcePositions() {
  return (tree) => {
    function visit(node) {
      const start = node.position?.start.offset;
      if (node.type === "element" && start != null)
        node.properties["data-start"] = start;
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type === "text" && child.position && child.value.trim()) {
          return {
            type: "element",
            tagName: "span",
            properties: { "data-start": child.position.start.offset },
            children: [child],
          };
        }
        visit(child);
        return child;
      });
    }
    visit(tree);
  };
}

const root = createRoot(document.getElementById("page"));
let titleLength = 0;
let sections = [];
function sourceOffset(section, position) {
  let delta = 0;
  for (const { start, from, to } of section.replacements) {
    if (position < start + delta) break;
    if (position < start + delta + to)
      return start + Math.min(from, position - start - delta);
    delta += to - from;
  }
  return position - delta;
}

window.showManuscript = (title, blocks, readOnly) => {
  titleLength = title.length;
  sections = blocks.map((block) => {
    const replacements = [];
    const markdown = block.editable
      ? normalizeMathMarkdown(block.source, (start, original, normalized) => {
          replacements.push({
            start,
            from: original.length,
            to: normalized.length,
          });
        })
      : block.source;
    return { ...block, markdown, replacements };
  });
  root.render(
    <>
      <h1 id="title">{title}</h1>
      {sections.map((section, index) =>
        section.editable ? (
          <article key={section.key} data-section={index}>
            <Markdown
              remarkPlugins={[
                remarkGfm,
                remarkMath,
                remarkMathAlignment,
                remarkTableBreaks,
              ]}
              rehypePlugins={[
                sourcePositions,
                [
                  rehypeKatex,
                  {
                    output: "mathml",
                    trust: false,
                    maxExpand: 200,
                    maxSize: 10,
                    throwOnError: false,
                  },
                ],
              ]}
              components={{
                img: ({ alt }) => <span>{alt || "图片"}</span>,
                input: ({ checked }) => (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={readOnly}
                    readOnly
                    aria-label="待办事项"
                  />
                ),
              }}
            >
              {section.markdown}
            </Markdown>
          </article>
        ) : (
          <aside key={section.key}>{section.source}</aside>
        ),
      )}
    </>,
  );
};

function notify(type, value, key = "") {
  window.webkit.messageHandlers.manuscript.postMessage({ type, value, key });
}
new ResizeObserver(() =>
  notify("height", document.getElementById("page").offsetHeight),
).observe(document.getElementById("page"));
document.addEventListener("click", (event) => {
  const article = event.target.closest("article");
  const section = article ? sections[Number(article.dataset.section)] : null;
  if (event.target.matches("input[type=checkbox]")) {
    event.preventDefault();
    const item = event.target.closest("li[data-start]");
    if (item && section)
      notify(
        "task",
        sourceOffset(section, Number(item.dataset.start)),
        section.key,
      );
    return;
  }
  const link = event.target.closest("a");
  if (link) {
    event.preventDefault();
    notify("link", link.getAttribute("href"));
    return;
  }
  if (window.getSelection()?.toString() || event.target.closest("aside"))
    return;
  const range = document.caretRangeFromPoint(event.clientX, event.clientY);
  const node = range?.startContainer;
  if (event.target.closest("#title")) {
    notify("edit", Math.min(range?.startOffset ?? 0, titleLength));
    return;
  }
  const target = section ?? sections.findLast((block) => block.editable);
  if (!target) return;
  const span = event.target.closest("[data-start]");
  let offset = target.source.length;
  if (span) {
    const local =
      node?.nodeType === Node.TEXT_NODE && node.parentElement === span
        ? range.startOffset
        : 0;
    offset = Math.min(
      sourceOffset(target, Number(span.dataset.start) + local),
      target.source.length,
    );
  }
  notify(
    "edit",
    (target.key === "" ? titleLength + 1 : 0) + offset,
    target.key,
  );
});
