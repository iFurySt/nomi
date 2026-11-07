import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/notes-code-block");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-"));
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/canvas.tsx"],
  outfile: join(output, "renderer.js"),
  bundle: true,
  format: "iife",
  jsx: "automatic",
  conditions: ["style", "browser"],
  define: { "process.env.NODE_ENV": '"development"' },
  alias: {
    "@nomi/core": join(root, "packages/core/src/index.ts"),
    "@nomi/platform": join(root, "packages/platform/src/index.ts"),
    react: join(root, "apps/web/node_modules/react"),
    "react-dom": join(root, "apps/web/node_modules/react-dom"),
  },
  loader: uiFixtureAssetLoaders,
  logLevel: "warning",
});
await writeFile(
  join(output, "index.html"),
  '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="renderer.css"><body><div id="root"></div><script src="renderer.js"></script></body></html>',
);

async function check({ output }) {
  const { app, BrowserWindow } = require("electron");
  const { writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  app.setPath("userData", join(output, "profile"));
  app.disableHardwareAcceleration();
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.on("console-message", ({ level, message }) => {
    if (level === "error") console.error(message);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg)})`);
  const assert = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const until = async (fn) => {
    for (let i = 0; i < 150; i++) {
      if (await fn()) return;
      await wait(40);
    }
    throw Error("Timed out");
  };
  const key = async (keyCode, modifiers = []) => {
    for (const type of ["keyDown", "keyUp"])
      win.webContents.sendInputEvent({ type, keyCode, modifiers });
    await wait(70);
  };
  try {
    await win.loadFile(join(output, "index.html"), { hash: "/notes" });
    await until(() =>
      run(() => !!document.querySelector('[aria-label="新建文稿"]')),
    );
    await run(() => document.querySelector('[aria-label="新建文稿"]').click());
    await until(() => run(() => !!document.querySelector(".tiptap")?.editor));
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    const source =
      'const greeting: string = "Hello Nomi";\n' +
      'console.log(greeting, "' +
      "A long line ".repeat(30) +
      '");\n// 中文注释\n';
    await run((source) => {
      const ed = document.querySelector(".tiptap").editor;
      ed.commands.setContent("```typescript\n" + source + "\n```", {
        contentType: "markdown",
      });
    }, source);
    await until(() => run(() => !!document.querySelector(".code-caption")));
    const click = (label) =>
      run(
        (label) => document.querySelector(`[aria-label="${label}"]`).click(),
        label,
      );
    await run(() => document.querySelector(".code-caption").focus());
    await win.webContents.insertText("示例代码");
    await key("Return");
    await until(() =>
      run(() =>
        document
          .querySelector(".tiptap")
          .editor.getMarkdown()
          .includes("示例代码"),
      ),
    );
    await click("代码语言");
    await until(() => run(() => !!document.querySelector('[role="option"]')));
    await run(() =>
      [...document.querySelectorAll('[role="option"]')]
        .find((e) => e.textContent.includes("Python"))
        .click(),
    );
    await until(() =>
      run(
        () =>
          document.querySelector(".tiptap").editor.getJSON().content[0].attrs
            .language === "python",
      ),
    );
    await click("代码自动换行");
    await until(() =>
      run(
        () => !!document.querySelector('.writing-code-block[data-wrap="true"]'),
      ),
    );
    assert(
      await run(() => {
        const block = document.querySelector(".writing-code-block");
        const area = block.querySelector(".code-scroll");
        const rows = [...block.querySelectorAll(".code-gutter-line")];
        return (
          area.scrollWidth <= area.clientWidth + 2 &&
          rows[1].getBoundingClientRect().height >
            rows[0].getBoundingClientRect().height
        );
      }),
      "Wrapped lines must fit and keep logical line numbers aligned",
    );
    await run(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copiedCode = text;
          },
        },
      }),
    );
    await click("复制代码");
    await until(() => run((source) => window.copiedCode === source, source));
    const saved = await run(() =>
      document.querySelector(".tiptap").editor.getMarkdown(),
    );
    await run(
      (saved) =>
        document
          .querySelector(".tiptap")
          .editor.commands.setContent(saved, { contentType: "markdown" }),
      saved,
    );
    await until(() =>
      run(() => document.querySelector(".code-caption").value === "示例代码"),
    );
    assert(
      await run((source) => {
        const node = document.querySelector(".tiptap").editor.getJSON()
          .content[0];
        return (
          node.attrs.wrap &&
          node.attrs.language === "python" &&
          node.content[0].text === source
        );
      }, source),
      "Reopen must preserve code and metadata",
    );
    const html = await run(() =>
      document.querySelector(".tiptap").editor.getHTML(),
    );
    await run(
      (html) =>
        document.querySelector(".tiptap").editor.commands.setContent(html),
      html,
    );
    assert(
      await run(() => {
        const attrs = document.querySelector(".tiptap").editor.getJSON()
          .content[0].attrs;
        return (
          attrs.wrap &&
          attrs.language === "python" &&
          attrs.caption === "示例代码"
        );
      }),
      "HTML round trip lost metadata",
    );
    await click("折叠代码");
    assert(
      await run(() => document.querySelector(".code-scroll").hidden),
      "Collapse failed",
    );
    await click("展开代码");
    // Escape cancels caption editing rather than committing its draft on blur.
    await run(() => document.querySelector(".code-caption").focus());
    await key("A", ["meta"]);
    await win.webContents.insertText("cancel me");
    await key("Escape");
    assert(
      await run(
        () => document.querySelector(".code-caption").value === "示例代码",
      ),
      "Caption cancellation failed",
    );
    // Select-all inside code stays in that block, including repeated presses.
    const range = await run(() => {
      const ed = document.querySelector(".tiptap").editor;
      const code = ed.getJSON().content[0];
      ed.commands.setContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Before code" }],
          },
          code,
          {
            type: "paragraph",
            content: [{ type: "text", text: "After code" }],
          },
        ],
      });
      const from = ed.state.doc.firstChild.nodeSize + 1;
      ed.commands.focus();
      ed.commands.setTextSelection(from + 2);
      return { from, to: from + ed.state.doc.child(1).content.size };
    });
    await wait(120);
    for (let i = 0; i < 2; i++) {
      await key("A", ["meta"]);
      assert(
        await run(({ from, to }) => {
          const selection =
            document.querySelector(".tiptap").editor.state.selection;
          return selection.from === from && selection.to === to;
        }, range),
        "Code select-all escaped into the document: " +
          JSON.stringify(
            await run(() => ({
              selection: document
                .querySelector(".tiptap")
                .editor.state.selection.toJSON(),
              focus: document.activeElement.outerHTML.slice(0, 120),
            })),
          ) +
          JSON.stringify(range),
      );
    }
    // Let the shared document history start a new typing group.
    await wait(1100);
    await win.webContents.insertText("replacement");
    assert(
      await run(() => {
        const doc = document.querySelector(".tiptap").editor.state.doc;
        return (
          doc.child(0).textContent === "Before code" &&
          doc.child(1).textContent === "replacement" &&
          doc.child(2).textContent === "After code"
        );
      }),
      "Typing after select-all replaced adjacent paragraphs",
    );
    await key("Z", ["meta"]);
    await wait(120);
    assert(
      await run(
        (source) =>
          document.querySelector(".tiptap").editor.state.doc.child(1)
            .textContent === source,
        source,
      ),
      "Code replacement undo lost content",
    );
    await run(() => {
      const ed = document.querySelector(".tiptap").editor;
      ed.commands.setTextSelection(2);
    });
    await key("A", ["meta"]);
    assert(
      await run(() => {
        const { selection, doc } =
          document.querySelector(".tiptap").editor.state;
        return selection.from <= 1 && selection.to >= doc.content.size - 1;
      }),
      "Normal document select-all was intercepted",
    );
    await run(() => {
      document.querySelector(".tiptap").editor.commands.setTextSelection(1);
      document.activeElement.blur();
    });
    const move = async (selector) => {
      const point = selector
        ? await run((selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }, selector)
        : { x: 1, y: 1 };
      await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...point,
      });
      await wait(80);
    };
    await move();
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".code-language")).opacity ===
            "0" &&
          getComputedStyle(document.querySelector(".code-fold")).opacity ===
            "0",
      ),
      "Resting code toolbar is not quiet",
    );
    writeFileSync(
      join(output, "resting.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await move(".writing-code-block");
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".code-language")).opacity ===
          "1",
      ),
      "Hover does not reveal code tools",
    );
    for (const selector of [".code-tool[aria-pressed]", ".code-copy"]) {
      await move(selector);
      assert(
        await run((selector) => {
          const tool = document.querySelector(selector);
          return (
            getComputedStyle(tool).backgroundColor !== "rgba(0, 0, 0, 0)" &&
            getComputedStyle(tool).backgroundColor !==
              getComputedStyle(tool.closest(".writing-code-block"))
                .backgroundColor
          );
        }, selector),
        "Code tool has no distinct hover feedback: " + selector,
      );
    }
    await click("折叠代码");
    await run(() => document.activeElement.blur());
    await move();
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".code-fold")).opacity ===
            "1" &&
          getComputedStyle(document.querySelector(".code-language")).opacity ===
            "0",
      ),
      "Collapsed block must retain only disclosure and caption",
    );
    writeFileSync(
      join(output, "collapsed.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await run(() => document.querySelector(".code-caption").focus());
    assert(
      await run(() => {
        const input = document.querySelector(".code-caption"),
          style = getComputedStyle(input);
        return (
          style.backgroundColor === "rgba(0, 0, 0, 0)" &&
          style.color === getComputedStyle(input.parentElement).color
        );
      }),
      "Caption editing is boxed or louder than toolbar",
    );
    writeFileSync(
      join(output, "caption-editing.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await key("Escape");
    await click("展开代码");
    await move(".code-copy");
    // Fixed-height resizing is a single change, with content scrolling inside.
    const autoHeight = await run(
      () => document.querySelector(".code-scroll").clientHeight,
    );
    const resizeStart = await run(() => {
      const r = document
        .querySelector(".code-resize-handle")
        .getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const mouse = (type, point, extra = {}) =>
      win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
        type,
        ...point,
        ...extra,
      });
    await mouse("mouseMoved", resizeStart);
    await mouse("mousePressed", resizeStart, { button: "left", clickCount: 1 });
    await mouse(
      "mouseMoved",
      { x: resizeStart.x, y: resizeStart.y - autoHeight + 100 },
      { button: "left", buttons: 1 },
    );
    await wait(80);
    assert(
      await run(() => {
        const ed = document.querySelector(".tiptap").editor;
        return (
          ed.state.doc.child(1).attrs.height === null &&
          document.querySelector(".code-scroll").clientHeight === 100
        );
      }),
      "Drag should preview without saving every pointer move",
    );
    await mouse(
      "mouseReleased",
      { x: resizeStart.x, y: resizeStart.y - autoHeight + 100 },
      { button: "left", clickCount: 1 },
    );
    await wait(100);
    assert(
      await run(() => {
        const area = document.querySelector(".code-scroll");
        area.scrollTop = 60;
        return (
          area.clientHeight === 100 &&
          area.scrollHeight > area.clientHeight &&
          area.scrollTop > 0 &&
          document.querySelector(".tiptap").editor.state.doc.child(1).attrs
            .height === 100
        );
      }),
      "Resize failed to constrain the viewport and allow internal scrolling",
    );
    await move(".code-resize-handle");
    writeFileSync(
      join(output, "resized.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    // Document undo/redo restores auto sizing / fixed height without changing code.
    await run(() => document.querySelector(".tiptap").editor.commands.undo());
    assert(
      await run(
        () =>
          document.querySelector(".tiptap").editor.state.doc.child(1).attrs
            .height === null,
      ),
      "Resize undo did not restore automatic height",
    );
    await run(() => document.querySelector(".tiptap").editor.commands.redo());
    const fixedMarkdown = await run(() =>
      document.querySelector(".tiptap").editor.getMarkdown(),
    );
    await run(
      (text) =>
        document
          .querySelector(".tiptap")
          .editor.commands.setContent(text, { contentType: "markdown" }),
      fixedMarkdown,
    );
    assert(
      await run(
        () =>
          document.querySelector(".tiptap").editor.state.doc.child(1).attrs
            .height === 100,
      ),
      "Fixed height lost on Markdown reopen",
    );
    await click("折叠代码");
    assert(
      await run(
        () =>
          !document.querySelector(".code-resize-handle") &&
          document.querySelector(".code-scroll").hidden,
      ),
      "Collapsed code retained its resize grip",
    );
    await click("展开代码");
    assert(
      await run(
        () => document.querySelector(".code-scroll").clientHeight === 100,
      ),
      "Expand lost fixed height",
    );
    await run(() =>
      document
        .querySelector(".code-resize-handle")
        .dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
    assert(
      await run(
        () =>
          document.querySelector(".tiptap").editor.state.doc.child(1).attrs
            .height === null &&
          document.querySelector(".code-scroll").clientHeight > 100,
      ),
      "Double-click should restore automatic height",
    );
    await move(".code-resize-handle");
    for (const theme of ["light", "dark"]) {
      await run(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await wait(80);
      writeFileSync(
        join(output, theme + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    }
    win.setSize(700, 900);
    await wait(120);
    assert(
      await run(() => {
        const bar = document.querySelector(".code-toolbar");
        return bar.scrollWidth <= bar.clientWidth + 1;
      }),
      "Narrow toolbar overflowed",
    );
    writeFileSync(
      join(output, "narrow.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    console.log(
      "Code block passed: caption, language, wrap/gutter, copy, collapse, Markdown round trip, Escape, scoped select-all/undo, hover controls, resize/scroll/undo/reopen/reset, themes and narrow layout.",
    );
    app.exit(0);
  } catch (e) {
    console.error(e);
    writeFileSync(
      join(output, "failure.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    app.exit(1);
  }
}
await writeFile(
  join(output, "main.cjs"),
  `(${check})(${JSON.stringify({ output })});setTimeout(()=>require('electron').app.exit(1),90000);`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  env,
  stdio: "inherit",
});
process.exitCode = await new Promise((resolve) =>
  child.once("exit", (code) => resolve(code ?? 1)),
);
console.log(output);
