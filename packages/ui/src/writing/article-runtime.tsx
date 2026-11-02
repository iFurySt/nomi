import { useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkMathAlignment } from "./mathSource";
import { remarkTableBreaks } from "./tableMarkdown";
import "./math.css";
import { MarkdownCodeBlock } from "./CodeContent";
import {
  parseCanvasDocument,
  hydrateStudyState,
  setStudyValue,
  runStudyAction,
  noteAssetFile,
  type InteractiveProgram,
} from "@nomi/core";
import { InteractiveRenderer } from "../interactive/InteractiveRenderer";
import "../interactive/learning.css";
import "katex/dist/katex.min.css";
import "./article-runtime.css";
function Experiment({ program }: { program: InteractiveProgram }) {
  const [state, setState] = useState(() => hydrateStudyState(program));
  return (
    <InteractiveRenderer
      program={program}
      state={state}
      onSet={(id, value) =>
        setState((s) => setStudyValue(program, s, id, value))
      }
      onAction={(id) => setState((s) => runStudyAction(program, s, id))}
      onCommit={() => {}}
    />
  );
}
try {
  const payload = JSON.parse(
    document.getElementById("nomi-article")!.textContent!,
  );
  const doc = parseCanvasDocument(payload.document);
  const note = doc.notes[0];
  const blocks = payload.block
    ? doc.blocks.filter((b) => b.id === payload.block)
    : note.blocks.map((id) => doc.blocks.find((b) => b.id === id)!);
  createRoot(document.getElementById("root")!).render(
    <article className="published-note">
      {!payload.block && <h1>{note.title}</h1>}
      {blocks.map((block) => (
        <section key={block.id}>
          {block.type === "markdown" ? (
            <ReactMarkdown
              remarkPlugins={[
                remarkGfm,
                remarkMath,
                remarkMathAlignment,
                remarkTableBreaks,
              ]}
              rehypePlugins={[rehypeKatex]}
              components={{
                pre: MarkdownCodeBlock,
                img: ({ alt }) => <span>{alt}（图片请查看原文附件）</span>,
                a: ({ href, children }) => (
                  <a href={href} rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {block.source}
            </ReactMarkdown>
          ) : block.type === "interactive" ? (
            <Experiment program={block.program} />
          ) : block.type === "note-reference" ? (
            <p>{block.title || "未命名文稿"}（文稿引用，请在 Nomi 中打开）</p>
          ) : block.type === "shape" ? (
            <p>{block.text}</p>
          ) : (
            <>
              {block.type === "image" ? (
                <figure className="article-image">
                  <img
                    alt={doc.assets.find((a) => a.id === block.asset)!.name}
                    src={noteAssetFile(
                      doc.assets.find((a) => a.id === block.asset)!,
                    )}
                  />
                  {block.caption && <figcaption>{block.caption}</figcaption>}
                </figure>
              ) : (
                <a
                  download
                  href={noteAssetFile(
                    doc.assets.find((a) => a.id === block.asset)!,
                  )}
                >
                  {doc.assets.find((a) => a.id === block.asset)!.name}
                </a>
              )}
            </>
          )}
        </section>
      ))}
    </article>,
  );
} catch {
  document.getElementById("root")!.textContent = "无法打开此文稿。";
}
