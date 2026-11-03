import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(
    process.env.NOMI_SLASH_PRODUCTION
      ? ".artifacts/notes-slash-production"
      : ".artifacts/notes-slash",
  );
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
async function checkSlash({ output, report, entry }) {
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
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const js = (s) => win.webContents.executeJavaScript(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (s) => {
    for (let i = 0; i < 150; i++) {
      if (await js(s)) return;
      await wait(30);
    }
    throw Error("Timeout: " + s);
  };
  const key = async (keyCode, modifiers = []) => {
    for (const type of ["keyDown", "keyUp"])
      win.webContents.sendInputEvent({ type, keyCode, modifiers });
    await wait(80);
  };
  const type = async (text) => {
    await win.webContents.insertText(text);
    await wait(100);
  };
  const shot = async (name) => {
    await wait(220);
    writeFileSync(
      join(report, name + ".png"),
      (await win.webContents.capturePage()).toPNG(),
    );
  };
  const reset = async (
    content = { type: "doc", content: [{ type: "paragraph" }] },
  ) => {
    await js(
      `(()=>{window.ed=document.querySelector('.tiptap').editor;ed.commands.setContent(${JSON.stringify(content)});ed.commands.focus('end')})()`,
    );
    await wait(80);
  };
  const command = async (text) => {
    await reset();
    await type(text);
    await until("document.querySelector('.writing-slash-menu')");
  };
  try {
    await win.loadFile(entry, { hash: "/notes" });
    await until("document.querySelector('[aria-label=新建文稿]')");
    await js("document.querySelector('[aria-label=新建文稿]').click()");
    await until("document.querySelector('.tiptap')");
    if (process.env.NOMI_SLASH_MANUAL) {
      win.setTitle("Nomi · Slash menu QA");
      console.log("Manual slash QA ready (isolated profile)");
      return;
    }
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await command("/");
    assert.equal(
      await js(
        "document.querySelectorAll('.writing-slash-menu [role=option]').length",
      ),
      16,
    );
    assert.equal(
      await js(
        "Array.from(document.querySelectorAll('.writing-slash-menu [role=option]')).some(el => el.textContent.trim() === '画布')",
      ),
      true,
    );
    await shot("menu-light");
    await key("Down");
    await key("Return");
    await until("document.querySelector('.tiptap h1')");
    assert.equal(await js("ed.state.doc.textContent"), "");
    await key("z", ["meta"]);
    await until("document.querySelector('.tiptap').textContent==='/'");
    await key("z", ["meta", "shift"]);
    await until("document.querySelector('.tiptap h1')");
    await command("/标题 2");
    await key("Return");
    await until("document.querySelector('.tiptap h2')");
    await command("/todo");
    await key("Return");
    await until("document.querySelector('.tiptap ul[data-type=taskList]')");
    await command("/table");
    await key("Return");
    await until("document.querySelector('.tiptap table')");
    assert.equal(
      await js("document.querySelectorAll('.tiptap table tr').length"),
      3,
    );
    await command("/notfound");
    assert.ok(await js("document.querySelector('.writing-slash-empty')"));
    await key("Escape");
    assert.equal(await js("ed.state.doc.textContent"), "/notfound");
    await type("x");
    assert.equal(
      await js("!!document.querySelector('.writing-slash-menu')"),
      false,
    );
    await reset();
    await type("https://example.com/");
    assert.equal(
      await js("!!document.querySelector('.writing-slash-menu')"),
      false,
    );
    await reset({ type: "doc", content: [{ type: "codeBlock" }] });
    await type("/");
    assert.equal(
      await js("!!document.querySelector('.writing-slash-menu')"),
      false,
    );
    await reset({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
      ],
    });
    await type("/");
    assert.equal(
      await js("!!document.querySelector('.writing-slash-menu')"),
      false,
    );
    await command("/");
    await key("Up");
    assert.equal(
      await js(
        "document.querySelector('.writing-slash-menu [aria-selected=true]').textContent",
      ),
      "交互实验",
    );
    await js("document.documentElement.dataset.theme='dark'");
    await shot("menu-dark");
    await js("document.documentElement.dataset.theme='light'");
    win.setSize(390, 620);
    await until("innerWidth===390");
    await js("ed.view.dom.scrollIntoView({block:'end'})");
    await wait(100);
    assert.ok(
      await js(
        "(()=>{const r=document.querySelector('.writing-slash-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()",
      ),
    );
    await shot("menu-narrow");
    win.setSize(1120, 820);
    await until("innerWidth===1120");
    await command("/math");
    await key("Return");
    await until("document.querySelector('.writing-math-popover textarea')");
    await key("Escape");
    await until("!document.querySelector('.writing-math-popover')");
    assert.equal(await js("ed.state.doc.textContent"), "/math");
    // Real Chromium marked text: slash filtering must not claim IME Enter or deletion.
    await command("/");
    await win.webContents.debugger.sendCommand("Input.imeSetComposition", {
      text: "biaoti",
      selectionStart: 6,
      selectionEnd: 6,
    });
    await wait(100);
    assert.equal(
      await js("!!document.querySelector('.writing-slash-menu')"),
      false,
    );
    await win.webContents.debugger.sendCommand("Input.imeSetComposition", {
      text: "biao",
      selectionStart: 4,
      selectionEnd: 4,
    });
    await wait(100);
    assert.ok(await js("ed.view.composing"));
    await win.webContents.debugger.sendCommand("Input.insertText", {
      text: "标题",
    });
    await until(
      "document.querySelectorAll('.writing-slash-menu [role=option]').length===3",
    );
    assert.equal(await js("ed.state.doc.textContent"), "/标题");
    await key("Return");
    await until("document.querySelector('.tiptap h1')");
    // External blocks use the existing replacement transaction and cancellation semantics.
    await js("document.querySelector('[aria-label=新建文稿]').click()");
    await until("document.querySelector('.tiptap')");
    await command("/page");
    await key("Return");
    await until("document.querySelector('[aria-label=查找文稿]')");
    await js("document.querySelector('.note-reference-result button').click()");
    await until("document.querySelector('.writing-block-note-reference')");
    assert.ok(
      await js(
        "!document.querySelector('.writing-article').textContent.includes('/page')",
      ),
    );
    await key("z", ["meta"]);
    // Restore focus to the writing area for shared history (picker may have no focus after insert).
    if (await js("!!document.querySelector('.writing-block-note-reference')"))
      await js(
        "document.querySelector('.writing-article').dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true}))",
      );
    await until("!document.querySelector('.writing-block-note-reference')");
    await until("document.querySelector('[data-save-state=saved]')");
    await new Promise((r) => {
      win.webContents.once("did-finish-load", r);
      win.reload();
    });
    await until("document.querySelector('.tiptap')?.textContent==='/page'");
    assert.equal(await js("window.canvasFixture?.requests ?? 0"), 0);
    console.log(
      "Slash menu: PASS (native input, keyboard, search, conversion, table, undo/redo, escape, exclusions, viewport, themes, IME, reference, persistence)",
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
  `(${checkSlash.toString()})(${JSON.stringify({ output, report, entry: process.env.NOMI_SLASH_PRODUCTION ? resolve("apps/web/dist/index.html") : join(output, "index.html") })});if(!process.env.NOMI_SLASH_MANUAL)setTimeout(()=>process.exit(1),60000);`,
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
