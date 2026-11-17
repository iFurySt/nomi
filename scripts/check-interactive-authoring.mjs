import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/interactive-authoring");
await mkdir(report, { recursive: true });
const output = await mkdtemp(join(report, "run-"));
await build({
  entryPoints: ["scripts/fixtures/canvas.tsx"],
  outfile: join(output, "renderer.js"),
  bundle: true,
  format: "iife",
  jsx: "automatic",
  conditions: ["style", "browser"],
  define: { "process.env.NODE_ENV": '"development"' },
  alias: {
    "@nomi/core": resolve("packages/core/src/index.ts"),
    "@nomi/platform": resolve("packages/platform/src/index.ts"),
    react: resolve("apps/web/node_modules/react"),
    "react-dom": resolve("apps/web/node_modules/react-dom"),
  },
  loader: uiFixtureAssetLoaders,
  logLevel: "warning",
});
await writeFile(
  join(output, "index.html"),
  '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="renderer.css"><body><div id="root"></div><script src="renderer.js"></script></body></html>',
);
async function check({ output, program }) {
  const { app, BrowserWindow, clipboard } = require("electron");
  const assert = require("node:assert/strict");
  const path = require("node:path");
  app.setPath("userData", path.join(output, "profile"));
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1100,
    height: 900,
    show: false,
    webPreferences: { backgroundThrottling: false },
  });
  const js = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg)})`);
  const until = async (fn) => {
    for (let i = 0; i < 260; i++) {
      if (await js(fn)) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error("Timed out: " + fn);
  };
  try {
    await win.loadFile(path.join(output, "index.html"), { hash: "/notes" });
    await until(() => !!document.querySelector('[aria-label="新建文稿"]'));
    await js(() => document.querySelector('[aria-label="新建文稿"]').click());
    await until(() => !!document.querySelector(".tiptap"));
    const paste = async (text, html = "") =>
      js(
        ({ text, html }) => {
          const editor = document.querySelector(".tiptap");
          editor.focus();
          const selection = getSelection(),
            range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
          const data = new DataTransfer();
          data.setData("text/plain", text);
          if (html) data.setData("text/html", html);
          editor.dispatchEvent(
            new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: data,
            }),
          );
        },
        { text, html },
      );
    await paste(JSON.stringify(program));
    await until(
      () => document.querySelectorAll(".canvas-interactive").length === 1,
    );
    // Isolated clipboard adapter: never replace the user's clipboard in background tests.
    await js(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          write: async ([item]) => {
            window.copiedProgram = await (
              await item.getType("text/plain")
            ).text();
            window.copiedHTML = await (await item.getType("text/html")).text();
          },
          writeText: async (text) => {
            window.copiedProgram = text;
          },
        },
      }),
    );
    await js(() => document.querySelector('[aria-label="复制交互块"]').click());
    await until(
      () =>
        !!document.querySelector('[aria-label="复制交互块"] svg.lucide-check'),
    );
    assert.deepEqual(JSON.parse(await js(() => window.copiedProgram)), program);
    assert.match(await js(() => window.copiedHTML), /data-nomi-interactive/);
    // Copy into a different note, using HTML even when another clipboard consumer changed plain text.
    await js(() => document.querySelector('[aria-label="新建文稿"]').click());
    await until(
      () =>
        !!document.querySelector(".tiptap") &&
        !document.querySelector(".canvas-interactive"),
    );
    await paste("clipboard fallback", await js(() => window.copiedHTML));
    await until(
      () => document.querySelectorAll(".canvas-interactive").length === 1,
    );
    await paste(await js(() => window.copiedProgram));
    await until(
      () => document.querySelectorAll(".canvas-interactive").length === 2,
    );
    await js(() => document.querySelector('[aria-label="编辑 DSL"]').click());
    await until(() => !!document.querySelector('[aria-label="交互块 DSL"]'));
    await js(() => {
      const el = document.querySelector('[aria-label="交互块 DSL"]');
      const value = JSON.parse(el.value);
      value.id = "manual-dsl-edited";
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(el, JSON.stringify(value));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await js(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .find((b) => b.textContent === "应用")
        .click(),
    );
    await until(() => !document.querySelector('[role="dialog"]'));
    await js(() => {
      document.querySelector(".tiptap").focus();
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await js(() => document.querySelector('[aria-label="编辑 DSL"]').click());
    await until(() => !!document.querySelector('[aria-label="交互块 DSL"]'));
    assert.equal(
      await js(
        () =>
          JSON.parse(document.querySelector('[aria-label="交互块 DSL"]').value)
            .id,
      ),
      program.id,
    );
    await js(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .find((b) => b.textContent === "取消")
        .click(),
    );
    require("node:fs").writeFileSync(
      path.join(output, "copied-blocks.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    const before = await js(
      () => document.querySelector(".writing-article").innerHTML,
    );
    const unsupported = structuredClone(program);
    unsupported.requires.components.FutureWidget = 1;
    await paste(JSON.stringify(unsupported));
    await until(() =>
      document
        .querySelector(".toast.visible")
        ?.textContent.includes("请更新 Nomi"),
    );
    assert.equal(
      await js(() => !!document.querySelector(".notes-notice")),
      false,
    );
    assert.equal(
      await js(() => document.querySelector(".writing-article").innerHTML),
      before,
    );
    assert.equal(
      await js(() => document.activeElement.classList.contains("tiptap")),
      true,
    );
    await new Promise((r) => setTimeout(r, 220));
    const box = await js(() => {
      const b = document.querySelector(".toast").getBoundingClientRect();
      return { top: b.top, center: b.left + b.width / 2, viewport: innerWidth };
    });
    assert(box.top >= 48 && box.top < 100);
    assert(Math.abs(box.center - box.viewport / 2) < 2);
    require("node:fs").writeFileSync(
      path.join(output, "paste-toast.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    win.setSize(420, 800);
    await js(() => document.documentElement.dataset.theme = "dark");
    await until(() => innerWidth === 420);
    await js(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await js(() => {
      const b = document.querySelector(".toast").getBoundingClientRect();
      return b.left >= 10 && b.right <= innerWidth - 10;
    }), true);
    require("node:fs").writeFileSync(path.join(output, "paste-toast-dark-narrow.png"), (await win.webContents.capturePage()).toPNG());
    await until(() => !document.querySelector(".toast.visible"));
    console.log(
      "Interactive authoring PASS: cross-note HTML and plain DSL clipboard, unsupported paste toast with unchanged document/focus, auto-dismiss; paste at cursor, clipboard roundtrip, independent copy, DSL apply/undo",
    );
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
}
const { readFile } = await import("node:fs/promises");
const program = JSON.parse(
  await readFile(
    "skills/nomi-interactive/assets/bpe-compact.nomi-ui.json",
    "utf8",
  ),
);
await writeFile(
  join(output, "main.cjs"),
  `(${check})(${JSON.stringify({ output, program })});setTimeout(()=>require('electron').app.exit(1),45000)`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  env,
  stdio: "inherit",
});
process.exitCode = await new Promise((r) => child.on("exit", (c) => r(c ?? 1)));
console.log(output);
