import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/notes-ime");
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

// Exercise Chromium's real marked-text path, not synthetic composition events.
async function checkIME({ output, disableGuard }) {
  const { app, BrowserWindow } = require("electron");
  const { writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  // CI VMs may have no EGL display; IME semantics do not require a GPU.
  if (process.env.CI) app.disableHardwareAcceleration();
  app.setPath("userData", join(output, "profile"));
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: !!process.env.CI,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const run = (fn, data) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(data)})`);
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const until = async (predicate, message) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await predicate()) return;
      await wait(50);
    }
    throw Error(message);
  };
  const key = async (keyCode, modifiers = []) => {
    for (const type of ["keyDown", "keyUp"])
      win.webContents.sendInputEvent({ type, keyCode, modifiers });
    await wait(70);
  };
  try {
    await win.loadFile(join(output, "index.html"), { hash: "/notes" });
    for (let i = 0; i < 100; i++) {
      if (await run(() => !!document.querySelector('[aria-label="新建文稿"]')))
        break;
      await wait(30);
    }
    win.webContents.debugger.attach("1.3");
    // Hidden CI windows must retain document focus for Chromium IME events.
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    const state = () =>
      run(() => ({
        text: window.imeEditor.state.doc.textContent,
        dom: window.imeEditor.view.dom.textContent,
        composing: window.imeEditor.view.composing,
        focused: document.activeElement === window.imeEditor.view.dom,
        starts: window.imeStarts,
      }));
    const compose = async (text) => {
      await win.webContents.debugger.sendCommand("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
      await wait(70);
    };
    const commit = async (text) => {
      await win.webContents.debugger.sendCommand("Input.insertText", { text });
      await wait(80);
    };
    const report = [];
    for (const scenario of [
      { name: "empty paragraph", seed: "", prefix: "", suffix: "" },
      {
        name: "middle of paragraph",
        seed: "前文后文",
        prefix: "前文",
        suffix: "后文",
      },
      { name: "heading", seed: "## 前文后文", prefix: "前文", suffix: "后文" },
      {
        name: "bullet list",
        seed: "- 前文后文",
        prefix: "前文",
        suffix: "后文",
      },
      {
        name: "code block",
        seed: "```text\n前文后文\n```",
        prefix: "前文",
        suffix: "后文",
      },
      {
        name: "replace selection",
        seed: "前文旧字后文",
        prefix: "前文",
        suffix: "后文",
        replace: 2,
      },
    ]) {
      await run(() =>
        document.querySelector('[aria-label="新建文稿"]').click(),
      );
      await wait(90);
      await run(
        ({ scenario, disableGuard }) => {
          const editor = document.querySelector(".tiptap").editor;
          window.imeEditor = editor;
          if (disableGuard) editor.unregisterPlugin("writingComposition");
          editor.commands.setContent(scenario.seed, {
            contentType: "markdown",
          });
          let start;
          editor.state.doc.descendants((node, pos) => {
            if (start === undefined && node.isTextblock) start = pos + 1;
          });
          const from = start + scenario.prefix.length;
          editor.commands.setTextSelection({
            from,
            to: from + (scenario.replace ?? 0),
          });
          editor.view.focus();
          window.imeStarts = 0;
          editor.view.dom.addEventListener(
            "compositionstart",
            () => window.imeStarts++,
          );
        },
        { scenario, disableGuard },
      );
      for (let attempt = 0; attempt < 40 && !(await state()).focused; attempt++)
        await wait(50);
      assert(
        (await state()).focused,
        scenario.name + ": editor did not acquire focus",
      );
      for (const text of [
        "z",
        "za",
        "zai",
        "zai y",
        "zai yu",
        "zai y",
        "zai",
      ]) {
        await compose(text);
        const current = await state();
        assert(
          current.text === scenario.prefix + text + scenario.suffix &&
            current.dom === current.text,
          `${scenario.name}: composing ${text} produced ${JSON.stringify(current)}`,
        );
        assert(
          current.composing && current.focused && current.starts === 1,
          `${scenario.name}: IME was interrupted: ${JSON.stringify(current)}`,
        );
      }
      // Saving/rendering while the candidate remains open must not break it.
      await wait(850);
      assert(
        (await state()).composing,
        scenario.name + ": pause ended composition",
      );
      await commit("在");
      const final = await state();
      assert(
        final.text === scenario.prefix + "在" + scenario.suffix &&
          !final.composing &&
          final.focused,
        `${scenario.name}: candidate commit corrupted text: ${JSON.stringify(final)}`,
      );
      report.push(scenario.name);
    }
    // Cancel a new composition, then start again and delete down to one letter.
    await run(() => {
      window.imeEditor.commands.setContent("", { contentType: "markdown" });
      window.imeEditor.commands.setTextSelection(1);
      window.imeEditor.view.focus();
    });
    await wait(70);
    await compose("ni hao");
    await compose("");
    assert(
      (await state()).text === "",
      "Cancelled composition left text behind",
    );
    for (const text of ["zai yu", "zai y", "zai", "za", "z"])
      await compose(text);
    await commit("在");
    assert(
      (await state()).text === "在",
      "Restart after cancellation corrupted text",
    );
    await win.webContents.debugger.sendCommand("Input.insertText", {
      text: "AB",
    });
    await key("Backspace");
    assert((await state()).text === "在A", "Normal Backspace stopped working");
    await key("Z", ["meta"]);
    await key("Z", ["meta", "shift"]);
    assert((await state()).text === "在A", "Undo/redo lost committed text");
    await run(() => {
      window.imeEditor.commands.focus();
      window.imeEditor.commands.blur();
    });
    const savedNoteId = await run(
      () =>
        document.querySelector('[data-note-row][aria-selected="true"]').dataset
          .noteRow,
    );
    await until(
      () =>
        run(async (noteId) => {
          if (!document.querySelector('[data-save-state="saved"]'))
            return false;
          const persisted = await window.canvasFixture
            .repository("local-device")
            .load();
          const note = persisted?.notes.find((n) => n.id === noteId);
          return note?.blocks.some((id) =>
            persisted.blocks.some(
              (b) =>
                b.id === id &&
                b.type === "markdown" &&
                b.source.trim() === "在A",
            ),
          );
        }, savedNoteId),
      "Committed text was not persisted before reload",
    );
    win.webContents.debugger.detach();
    await new Promise((resolve) => {
      win.webContents.once("did-finish-load", resolve);
      win.reload();
    });
    await until(
      () =>
        run(
          (noteId) =>
            document.querySelector('[data-note-row][aria-selected="true"]')
              ?.dataset.noteRow === noteId &&
            document.querySelector(".tiptap")?.textContent === "在A",
          savedNoteId,
        ),
      "Persisted text did not restore into the selected note after reload",
    );
    writeFileSync(
      join(output, "report.json"),
      JSON.stringify(
        {
          scenarios: report,
          cancelRestart: true,
          backspace: true,
          undoRedo: true,
          reload: true,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(output, "notes-ime.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    console.log(
      "Notes IME passed: " +
        report.join(", ") +
        ", cancel/restart, Backspace, undo/redo, saved reload.",
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    writeFileSync(
      join(output, "failure.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    app.exit(1);
  }
}
await writeFile(
  join(output, "main.cjs"),
  `(${checkIME})(${JSON.stringify({ output, disableGuard: process.env.NOMI_IME_DISABLE_GUARD === "1" })});setTimeout(()=>require('electron').app.exit(1),60000);`,
);
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  stdio: "inherit",
});
process.exitCode = await new Promise((resolve) =>
  child.on("exit", (code) => resolve(code ?? 1)),
);
console.log(output);
