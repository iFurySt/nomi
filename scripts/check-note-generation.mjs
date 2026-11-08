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
async function checkAI({ output, width }) {
  const { app, BrowserWindow } = require("electron");
  const { writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  const assert = require("node:assert/strict");
  app.disableHardwareAcceleration();
  app.setPath("userData", join(output, "profile"));
  await app.whenReady();
  const win = new BrowserWindow({
    width,
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
    await wait(400);
    await shot("composer");
    const anchor = await js(() => {
      const editor = document.querySelector(".tiptap").editor;
      const caret = editor.view.coordsAtPos(22);
      const popup = document
        .querySelector('[aria-label="文稿 AI"]')
        .getBoundingClientRect();
      return {
        bottom: caret.bottom,
        left: caret.left,
        popupTop: popup.top,
        popupLeft: popup.left,
        popupWidth: popup.width,
        viewportWidth: window.innerWidth,
      };
    });
    assert.ok(
      Math.abs(anchor.popupTop - anchor.bottom - 10) < 2,
      "Composer opens below the selection " + JSON.stringify(anchor),
    );
    assert.ok(
      Math.abs(anchor.popupLeft - Math.max(16, Math.min(anchor.left, anchor.viewportWidth - anchor.popupWidth - 16))) < 2,
      "Composer follows cursor within viewport " + JSON.stringify(anchor),
    );
    await shot("composer");
    await prompt("Create an interactive temperature experiment");
    await enter();
    await until(() => !!document.querySelector(".note-ai-skeleton"));
    await shot("loading");
    await until(() => !!document.querySelector(".note-ai-preview-block"));
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
    await until(
      () =>
        document.querySelector('[aria-label="文稿 AI"]')?.dataset.busy ===
        "false",
    );
    assert.equal(
      await js(
        () =>
          document.querySelector('.canvas-ai-reply [role="status"]')
            ?.textContent,
      ),
      "已生成",
    );
    assert.equal(
      await js(
        () => document.querySelector('[aria-label="生成需求"]').placeholder,
      ),
      "继续调整…",
    );
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
    await prompt("Simplify the explanation and keep the working slider");
    await enter();
    await until(() => !!document.querySelector(".note-ai-skeleton"));
    await until(
      () =>
        document.querySelector('[aria-label="文稿 AI"]')?.dataset.busy ===
        "false",
    );
    await wait(900);
    const revisionPayload = await js(() => window.aiFixture.lastRequest());
    assert.equal(revisionPayload.messages.length, 3);
    assert.equal(revisionPayload.messages[1].source, "chatgpt");
    assert.match(revisionPayload.messages[1].content, /Generated explanation/);
    saved = await doc();
    const revisedOrder = saved.notes.find((n) => n.id === noteId).blocks;
    assert.equal(
      revisedOrder.length,
      4,
      "Continuation replaces, never appends duplicates",
    );
    assert.equal(revisedOrder[0], ordered[0].id);
    assert.equal(revisedOrder[3], ordered[3].id);
    assert.match(
      saved.blocks.find((b) => b.id === revisedOrder[1]).source,
      /Revised explanation/,
    );
    await shot("continued");
    // A failed or stopped revision leaves the successful result intact.
    await js(() => window.aiFixture.mode("unsupported"));
    await prompt("Unsupported revision");
    await enter();
    await until(() => !!document.querySelector(".canvas-ai-error"));
    assert.deepEqual(
      (await doc()).notes.find((n) => n.id === noteId).blocks,
      revisedOrder,
    );
    await js(() => window.aiFixture.mode("slow"));
    await prompt("Cancelled revision");
    await enter();
    await click("停止生成");
    await wait(2100);
    assert.deepEqual(
      (await doc()).notes.find((n) => n.id === noteId).blocks,
      revisedOrder,
    );
    // Undo restores the first result in one step, without touching original prose.
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
    assert.deepEqual(
      (await doc()).notes.find((n) => n.id === noteId).blocks,
      ordered.map((b) => b.id),
    );
    // After undo, an old chat cannot overwrite a now-different result.
    await js(() => window.aiFixture.mode("note"));
    await prompt("Stale revision");
    await enter();
    await until(() =>
      document
        .querySelector(".canvas-ai-error")
        ?.textContent.includes("插入位置"),
    );
    assert.deepEqual(
      (await doc()).notes.find((n) => n.id === noteId).blocks,
      ordered.map((b) => b.id),
    );
    await click("关闭 AI");
    const probabilities = await js(() =>
      [...document.querySelectorAll("[data-probability]")].map(
        (el) => el.textContent,
      ),
    );
    await js(() => {
      const slider = document.querySelector(
        '.canvas-interactive input[type="range"]',
      );
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(slider, "2.5");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await until(
      () =>
        document.querySelector(".learning-slider output")?.textContent ===
        "2.50",
    );
    await js(() =>
      document
        .querySelector('.canvas-interactive input[type="range"]')
        .dispatchEvent(new PointerEvent("pointerup", { bubbles: true })),
    );
    const changedProbabilities = await js(() =>
      [...document.querySelectorAll("[data-probability]")].map(
        (el) => el.textContent,
      ),
    );
    assert.notDeepEqual(
      changedProbabilities,
      probabilities,
      "Slider must change live numerical results",
    );
    assert.equal(
      await js(() => !!document.querySelector(".learning-alert")),
      false,
    );
    await shot("interactive-changed");
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

    await js(() =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await wait(900);
    win.reload();
    await until(
      () =>
        document.querySelector(".learning-slider output")?.textContent ===
        "2.50",
    );
    assert.deepEqual(
      await js(() =>
        [...document.querySelectorAll("[data-probability]")].map(
          (el) => el.textContent,
        ),
      ),
      changedProbabilities,
      "Reload restores the native block and learner progress",
    );
    saved = await doc();
    assert.ok(
      saved.notes
        .find((n) => n.id === noteId)
        .blocks.some(
          (id) => saved.blocks.find((b) => b.id === id)?.type === "interactive",
        ),
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
    await until(() =>
      document
        .querySelector(".canvas-ai-error")
        ?.textContent.includes("未生成可操作的交互块"),
    );
    await wait(900);
    saved = await doc();
    const diagramNote = await js(() =>
      new URLSearchParams(location.hash.split("?")[1]).get("note"),
    );
    assert.equal(
      saved.notes
        .find((n) => n.id === diagramNote)
        .blocks.some(
          (id) => saved.blocks.find((b) => b.id === id)?.type === "canvas",
        ),
      false,
      "Static diagram must not replace an interactive block",
    );
    assert.equal(
      await js(() => !!document.querySelector(".note-ai-preview")),
      false,
    );
    await shot("rejected-diagram");
    await click("关闭 AI");

    await prepare("/ai");
    await aiEnter();
    await js(() => window.aiFixture.mode("unsupported"));
    await prompt("An unsupported simulation");
    await enter();
    await until(() =>
      document
        .querySelector(".canvas-ai-error")
        ?.textContent.includes("暂不支持这种交互"),
    );
    assert.equal(
      await js(() => !!document.querySelector(".note-ai-preview")),
      false,
    );
    await click("关闭 AI");

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
    win.setSize(680, 560);
    await click("Switch to dark theme");
    await wait(450);
    const narrow = await js(() => {
      const r = document
        .querySelector('[aria-label="文稿 AI"]')
        .getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: innerWidth,
        height: innerHeight,
      };
    });
    assert.ok(narrow.left >= 15 && narrow.right <= narrow.width - 15);
    assert.ok(narrow.top >= 15 && narrow.bottom <= narrow.height - 15);
    await shot("anchored-dark-narrow");
    win.setSize(1120, 820);
    await wait(450);
    await prompt("Use the selected context");
    const count = await js(() => window.aiFixture.requests());
    await js(() =>
      document.querySelector('[aria-label="生成需求"]').dispatchEvent(
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
      "Note AI: PASS (anchored composer/dark/narrow, skeleton, persistent chat/revision/history, selection/cursor context, native interactions, live results/persist/reload, atomic undo/redo, stop/late response, stale source/result, diagram rejection, unsupported interaction, URL)",
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
  `(${checkAI})(${JSON.stringify({ output, width: Number(process.env.NOMI_AI_TEST_WIDTH || 1120) })});setTimeout(()=>require('electron').app.exit(1),60000);`,
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
