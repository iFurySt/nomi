import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/note-generation");
await mkdir(report, { recursive: true });
const output = await mkdtemp(join(report, "run-"));
await build({
  entryPoints: ["scripts/fixtures/note-generation.tsx"],
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
async function checkAI({ output }) {
  const { app, BrowserWindow } = require("electron");
  const { writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  const assert = require("node:assert/strict");
  app.disableHardwareAcceleration();
  app.setPath("userData", join(output, "profile"));
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1120,
    height: 820,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const js = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg)})`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn) => {
    for (let i = 0; i < 200; i++) {
      if (await js(fn)) return;
      await wait(20);
    }
    throw Error("Timeout: " + fn);
  };
  const shot = async (name) => {
    await wait(80);
    writeFileSync(
      join(output, name + ".png"),
      (await win.webContents.capturePage()).toPNG(),
    );
  };
  const click = (label) =>
    js((s) => document.querySelector(`[aria-label="${s}"]`).click(), label);
  const prompt = (value) =>
    js((v) => {
      const el = document.querySelector('[aria-label="生成需求"]');
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.focus();
    }, value);
  const enter = async () => {
    for (const type of ["keyDown", "keyUp"])
      win.webContents.sendInputEvent({ type, keyCode: "Return" });
    await wait(40);
  };
  const doc = () =>
    js(async () => window.aiFixture.repository("local-device").load());
  const prepare = async (source) => {
    await click("新建文稿");
    await until(() => !!document.querySelector(".tiptap")?.editor);
    await js((v) => {
      const e = document.querySelector(".tiptap").editor;
      e.commands.setContent(v, { contentType: "markdown" });
      e.commands.focus("end");
    }, source);
    await wait(100);
  };
  const aiEnter = async () => {
    await until(
      () =>
        !!document.querySelector('[role="option"][data-selected="true"]') ||
        !!document.querySelector(".writing-slash-menu"),
    );
    await enter();
    await until(() => document.querySelector('[aria-label="文稿 AI"]'));
    await until(
      () =>
        document.querySelector('[aria-label="生成模型"]')?.value ===
        "test-model",
    );
  };
  try {
    await win.loadFile(join(output, "index.html"), { hash: "/notes" });
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await until(() => !!document.querySelector('[aria-label="新建文稿"]'));
    await prepare("Before selected words after.\n\nFollowing paragraph.");
    await js(() => {
      const e = document.querySelector(".tiptap").editor;
      e.commands.setTextSelection({ from: 8, to: 22 });
      e.view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "/",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await aiEnter();
    await shot("composer");
    await prompt("Create an interactive temperature experiment");
    await enter();
    await until(() => !!document.querySelector(".note-ai-preview"));
    const payload = await js(() => window.aiFixture.lastRequest());
    assert.equal(payload.generation, "note");
    assert.equal(payload.noteContext.selected, "selected words");
    assert.equal(payload.noteContext.before, "Before ");
    assert.match(payload.noteContext.after, /after.*Following paragraph/s);
    assert.ok(payload.noteContext.title);
    assert.equal(
      (await doc()).blocks.filter(
        (b) => b.type === "interactive" && b.id.startsWith("ai_"),
      ).length,
      0,
    );
    await shot("streaming");
    await until(() => !document.querySelector('[aria-label="文稿 AI"]'));
    await wait(900);
    let saved = await doc();
    let note;
    const noteId = await js(() =>
      new URLSearchParams(location.hash.split("?")[1]).get("note"),
    );
    note = saved.notes.find((n) => n.id === noteId);
    const ordered = note.blocks.map((id) =>
      saved.blocks.find((b) => b.id === id),
    );
    assert.equal(ordered[0].source, "Before selected words");
    assert.match(ordered[1].source, /Generated explanation/);
    assert.equal(ordered[2].type, "interactive");
    assert.match(ordered[3].source, /after.*Following paragraph/s);
    await shot("inserted");
    await js(() =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await wait(900);
    saved = await doc();
    assert.equal(
      saved.notes.find((n) => n.id === noteId).blocks.length,
      1,
      "One undo removes the entire result",
    );
    assert.match(
      saved.blocks.find(
        (b) => b.id === saved.notes.find((n) => n.id === noteId).blocks[0],
      ).source,
      /Before selected words after/,
    );

    // Inline /ai retains text on both sides and omits the command from context.
    await prepare("Prefix /ai suffix");
    await js(() =>
      document.querySelector(".tiptap").editor.commands.setTextSelection(11),
    );
    await aiEnter();
    await js(() => window.aiFixture.mode("slow"));
    await prompt("Explain this");
    await enter();
    await until(() => !!document.querySelector(".note-ai-preview"));
    const inline = await js(() => window.aiFixture.lastRequest().noteContext);
    assert.equal(inline.before, "Prefix ");
    assert.equal(inline.after, " suffix");
    await click("停止生成");
    await wait(2100);
    assert.equal(
      await js(() => document.querySelectorAll(".note-ai-preview").length),
      0,
    );
    assert.equal(
      await js(() => document.querySelector(".tiptap").textContent),
      "Prefix  suffix",
    );
    await click("关闭 AI");

    // A changed source cannot receive late output.
    await prepare("/ai");
    await aiEnter();
    await prompt("A diagram");
    await enter();
    await until(() => !!document.querySelector(".note-ai-preview"));
    await js(() =>
      document
        .querySelector(".tiptap")
        .editor.commands.setContent("I kept writing", {
          contentType: "markdown",
        }),
    );
    await until(() =>
      document
        .querySelector(".canvas-ai-error")
        ?.textContent.includes("插入位置"),
    );
    assert.equal(
      await js(() => document.querySelector(".tiptap").textContent),
      "I kept writing",
    );
    await click("关闭 AI");

    await prepare("/ai");
    await aiEnter();
    await js(() => window.aiFixture.mode("diagram"));
    await prompt("Draw two connected blocks");
    await enter();
    await until(() => !document.querySelector('[aria-label="文稿 AI"]'));
    await wait(900);
    saved = await doc();
    const diagramNote = await js(() =>
      new URLSearchParams(location.hash.split("?")[1]).get("note"),
    );
    assert.ok(
      saved.notes
        .find((n) => n.id === diagramNote)
        .blocks.some(
          (id) => saved.blocks.find((b) => b.id === id)?.type === "canvas",
        ),
    );
    await shot("diagram");

    await prepare("https://example.com/a");
    assert.equal(
      await js(() => !!document.querySelector(".writing-slash-menu")),
      false,
      "URL must not open AI",
    );
    // The selection toolbar is an equivalent, non-destructive entry point.
    await prepare("Selected context");
    await js(() =>
      document
        .querySelector(".tiptap")
        .editor.commands.setTextSelection({ from: 1, to: 9 }),
    );
    await until(
      () =>
        !!document.querySelector(
          '.writing-selection-toolbar [aria-label="AI"]',
        ),
    );
    await click("AI");
    await until(() => !!document.querySelector('[aria-label="文稿 AI"]'));
    await prompt("Use the selected context");
    const count = await js(() => window.aiFixture.requests());
    await js(() =>
      document
        .querySelector('[aria-label="生成需求"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            isComposing: true,
            bubbles: true,
          }),
        ),
    );
    assert.equal(
      await js(() => window.aiFixture.requests()),
      count,
      "IME does not submit",
    );
    await js(() => window.aiFixture.mode("slow"));
    await enter();
    await until(() => !!document.querySelector(".note-ai-preview"));
    await js(() => (location.hash = "/canvas"));
    await wait(2200);
    assert.equal(
      await js(() => !!document.querySelector('[aria-label="文稿 AI"]')),
      false,
    );
    const cancelledNoteId = (await js(() => window.aiFixture.lastRequest()))
      .noteContext.selected;
    assert.equal(cancelledNoteId, "Selected");
    saved = await doc();
    assert.ok(
      saved.notes.some(
        (n) =>
          n.blocks.length === 1 &&
          saved.blocks.find((b) => b.id === n.blocks[0])?.source ===
            "Selected context",
      ),
      "Leaving notes must not insert late content",
    );
    console.log(
      "Note AI: PASS (selection/cursor context, preview, native experiments, atomic undo, stop/late response, stale source, embedded diagram, URL)",
    );
    app.exit(0);
  } catch (e) {
    console.error(e);
    await shot("failure");
    app.exit(1);
  }
}
await writeFile(
  join(output, "main.cjs"),
  `(${checkAI})(${JSON.stringify({ output })});setTimeout(()=>require('electron').app.exit(1),60000);`,
);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  env,
  stdio: "inherit",
});
process.exitCode = await new Promise((resolve) =>
  child.on("exit", (code) => resolve(code ?? 1)),
);

console.log(output);
