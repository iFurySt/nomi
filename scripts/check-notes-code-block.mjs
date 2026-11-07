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
      "Code block passed: caption, language, wrap/gutter, copy, collapse, Markdown round trip, Escape, themes and narrow layout.",
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
