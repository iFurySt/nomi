import React, { useRef } from "react";
import { createRoot } from "react-dom/client";
import { WritingOutline } from "../../packages/ui/src/writing/WritingOutline";
import "../../packages/ui/src/styles.css";
import "../../packages/ui/src/writing/writing.css";
function Fixture() {
  const scroll = useRef<HTMLDivElement>(null);
  return (
    <main
      className="notes-workspace"
      style={{ display: "flex", height: "100vh" }}
    >
      <div className="notes-main" style={{ width: "100%" }}>
        <div className="notes-writing-area">
          <div className="notes-scroll" ref={scroll}>
            <article className="writing-article">
              <h1 className="writing-title">Reading and learning</h1>
              <div className="tiptap">
                {[
                  "从一个问题开始",
                  "Build a service to better support multiple, complex products",
                  "从相似度到权重",
                  "总结与下一步",
                ].map((text, i) => (
                  <section key={text}>
                    {i === 2 ? <h3>{text}</h3> : <h2>{text}</h2>}
                    <p style={{ minHeight: 320 }}>
                      正文保持居中。目录使用左侧已有留白，固定和取消固定都不会移动正文。
                    </p>
                  </section>
                ))}
              </div>
            </article>
          </div>
          <WritingOutline scroll={scroll} noteId="outline-fixture" />
        </div>
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
