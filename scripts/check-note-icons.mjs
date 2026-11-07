import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/note-icons");
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
async function checks(phase) {
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const until = async (test) => {
    for (let i = 0; i < 200; i++) {
      if (await test()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("Timeout: " + test);
  };
  const row = () => document.querySelector('[data-note-row="note.questions"]');
  const open = async () => {
    row().querySelector(".notes-icon-button").click();
    await until(() => document.querySelector(".note-icon-picker"));
  };
  const input = (node, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const saved = () => window.canvasFixture.repository("local-device").load();
  const centered = () => {
    const button = row()
      .querySelector(".notes-icon-button")
      .getBoundingClientRect();
    const icon = row()
      .querySelector(".note-icon-image")
      .getBoundingClientRect();
    assert(
      Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2) < 0.5 &&
        Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2) < 0.5,
      "Icon is not centered in its hit target",
    );
  };
  if (phase === "hint-position") {
    location.hash = "/notes";
    await until(() => row()?.querySelector(".notes-icon-button"));
    centered();
    const r = row().querySelector(".notes-icon-button").getBoundingClientRect();
    return {
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
    };
  }
  if (phase === "hint-check") {
    await until(() => {
      const transform =
        document.querySelector(".nomi-tooltip")?.parentElement.style.transform;
      return (
        transform?.includes("translate") &&
        transform !== "translate(0px, -200%)" &&
        transform !== "translate(0, -200%)"
      );
    });
    const hint = document.querySelector(".nomi-tooltip"),
      r = hint.getBoundingClientRect(),
      b = row().querySelector(".notes-icon-button").getBoundingClientRect();
    assert(
      !hint.closest(".notes-library") && document.body.contains(hint),
      "Hint clipped by scroll container",
    );
    assert(
      Math.abs(r.x + r.width / 2 - b.x - b.width / 2) <= 1,
      "Hint is not centered above icon",
    );
    assert(
      r.bottom <= b.top - 3 && r.x >= 8,
      "Hint overlaps trigger or viewport edge",
    );
    return;
  }
  if (phase === "heading-add") {
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await until(() => !document.querySelector(".note-icon-picker"));
    row().querySelector(".notes-list-select").click();
    await until(() => document.querySelector(".writing-add-icon"));
    assert(
      !document.querySelector(".writing-heading-icon"),
      "Missing icon rendered as a default title icon",
    );
    const r = document.querySelector(".writing-title").getBoundingClientRect();
    return { x: Math.round(r.x + 40), y: Math.round(r.y + r.height / 2) };
  }
  if (phase === "heading-hidden" || phase === "heading-visible") {
    const expected = phase === "heading-visible" ? "1" : "0";
    await until(
      () =>
        getComputedStyle(document.querySelector(".writing-add-icon"))
          .opacity === expected,
    );
    return;
  }
  if (phase === "heading-choose") {
    const title = document.querySelector(".writing-title").value;
    document.querySelector(".writing-add-icon").click();
    await until(() => document.querySelector(".note-icon-picker"));
    input(document.querySelector('[aria-label="搜索 Emoji"]'), "书籍");
    await until(
      () =>
        document.querySelector(".note-emoji-grid button")?.textContent === "📚",
    );
    document.querySelector(".note-emoji-grid button").click();
    await until(
      () =>
        document.querySelector(".writing-heading-icon")?.textContent === "📚",
    );
    assert(
      row().querySelector(".notes-icon-button").textContent === "📚",
      "Heading icon not synced to tree",
    );
    assert(
      document.querySelector(".writing-title").value === title,
      "Icon replaced title",
    );
    const icon = document
        .querySelector(".writing-heading-icon")
        .getBoundingClientRect(),
      titleRect = document
        .querySelector(".writing-title")
        .getBoundingClientRect();
    assert(
      icon.right < titleRect.left && Math.abs(icon.y - titleRect.y) < 1,
      "Title icon is not beside title",
    );
    document.querySelector(".writing-heading-icon").focus();
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }),
    );
    await until(() => document.querySelector(".writing-add-icon"));
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
    await until(
      () =>
        document.querySelector(".writing-heading-icon")?.textContent === "📚",
    );
    return;
  }
  if (phase === "heading-open") {
    document.querySelector(".writing-heading-icon").click();
    await until(() => document.querySelector(".note-icon-picker"));
    return;
  }
  if (phase === "heading-image") {
    await until(
      () =>
        document.querySelector(".writing-heading-icon img")?.naturalWidth ===
        64,
    );
    assert(
      row().querySelector(".notes-icon-button img")?.naturalWidth === 64,
      "Title upload not synced to tree",
    );
    return;
  }
  if (phase === "heading-remove") {
    document.querySelector(".writing-heading-icon").click();
    await until(() => document.querySelector(".note-icon-remove"));
    document.querySelector(".note-icon-remove").click();
    await until(() => document.querySelector(".writing-add-icon"));
    assert(
      row().querySelector(".notes-icon-button svg"),
      "Title Remove did not restore tree icon",
    );
    assert(
      document.activeElement === document.querySelector(".writing-add-icon"),
      "Remove lost title trigger focus",
    );
    return;
  }
  if (phase === "prepare") {
    location.hash = "/notes";
    await until(() => document.querySelectorAll("[data-note-row]").length >= 2);
    const title = document.querySelector('[aria-label="文稿标题"]').value;
    await open();
    assert(
      !document.querySelector(".nomi-tooltip"),
      "Hint remained over picker",
    );
    assert(
      document.querySelectorAll(".note-icon-picker [role=tab]").length === 2,
      "Extra icon tab",
    );
    assert(
      document.querySelector('[aria-label="文稿标题"]').value === title,
      "Icon click changed selected note",
    );
    assert(
      !document.querySelector(".notes-tree-drag-preview"),
      "Icon click started tree drag",
    );
    input(document.querySelector('[aria-label="搜索 Emoji"]'), "书籍");
    await until(
      () =>
        document.querySelector(".note-emoji-grid button")?.textContent === "📚",
    );
    document.querySelector(".note-emoji-grid button").click();
    await until(() => !document.querySelector(".note-icon-picker"));
    await until(
      () => row().querySelector(".notes-icon-button").textContent === "📚",
    );
    await until(
      async () =>
        (await saved()).notes.find((n) => n.id === "note.questions").icon
          ?.value === "📚",
    );
    centered();
    // Document history receives Undo/Redo from the icon trigger, not text input history.
    row().querySelector(".notes-icon-button").focus();
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }),
    );
    await until(() => row().querySelector(".notes-icon-button svg"));
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
    await until(
      () => row().querySelector(".notes-icon-button").textContent === "📚",
    );
    await open();
    return;
  }
  if (phase === "upload") {
    document.querySelector('[role=tab][id$="-upload"]').click();
    await until(() => document.querySelector(".note-icon-upload input"));
    const give = async (file) => {
      const dt = new DataTransfer();
      dt.items.add(file);
      const field = document.querySelector(".note-icon-upload input");
      field.files = dt.files;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    };
    await give(new File(["<svg/>"], "fake.png", { type: "image/png" }));
    await until(() => document.querySelector(".note-icon-error"));
    assert(
      document.querySelector(".note-icon-picker"),
      "Invalid upload closed picker",
    );
    await give(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.png", {
        type: "image/png",
      }),
    );
    await until(() =>
      document.querySelector(".note-icon-error")?.textContent.includes("5 MB"),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    context.fillStyle = "#547cff";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "white";
    context.font = "bold 42px sans-serif";
    context.fillText("N", 16, 48);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve));
    await give(new File([blob], "icon.png", { type: "image/png" }));
    await until(() => !document.querySelector(".note-icon-picker"));
    await until(
      () => row().querySelector(".notes-icon-button img")?.naturalWidth === 64,
    );
    await until(
      async () =>
        (await saved()).notes.find((n) => n.id === "note.questions").icon
          ?.type === "image",
    );
    return;
  }
  if (phase === "restored") {
    await until(
      () => row()?.querySelector(".notes-icon-button img")?.naturalWidth === 64,
    );
    await open();
    document.querySelector(".note-icon-remove").click();
    await until(() => row().querySelector(".notes-icon-button svg"));
    await until(
      async () =>
        !(await saved()).notes.find((n) => n.id === "note.questions").icon,
    );
    await open();
    input(document.querySelector('[aria-label="搜索 Emoji"]'), "zzzznotfound");
    await until(() => document.querySelector(".note-emoji-empty"));
    input(document.querySelector('[aria-label="搜索 Emoji"]'), "");
    await until(
      () => document.querySelectorAll(".note-emoji-grid button").length > 50,
    );
    centered();
    // Escape closes the popover and returns focus to the icon button.
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await until(() => !document.querySelector(".note-icon-picker"));
    assert(
      document.activeElement === row().querySelector(".notes-icon-button"),
      "Focus not restored",
    );
    await open();
    return;
  }
}
await writeFile(
  join(output, "main.cjs"),
  `
const {app,BrowserWindow}=require('electron');const {writeFileSync}=require('node:fs');
app.disableHardwareAcceleration();
app.setPath('userData',${JSON.stringify(join(output, "profile"))});
app.whenReady().then(async()=>{const win=new BrowserWindow({width:1120,height:820,show:true,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});const js=s=>win.webContents.executeJavaScript(s);const run=async p=>{const r=await js('(async()=>{try{return {value:await ('+${JSON.stringify(checks.toString())}+')('+JSON.stringify(p)+')}}catch(e){return {error:e.stack}}})()');if(r.error)throw Error(r.error);return r.value;};
const shot=async(name)=>{await new Promise(r=>setTimeout(r,400));writeFileSync(${JSON.stringify(report)}+'/'+name+'.png',(await win.webContents.capturePage()).toPNG());};
try{await win.loadFile(${JSON.stringify(join(output, "index.html"))});win.show();win.focus();await new Promise(r=>setTimeout(r,300));const point=await run('hint-position');win.webContents.sendInputEvent({type:'mouseMove',x:1,y:1});win.webContents.sendInputEvent({type:'mouseEnter',...point});win.webContents.sendInputEvent({type:'mouseMove',...point});await run('hint-check');await shot('icon-hover');await run('prepare');await shot('emoji-light');await js("document.documentElement.dataset.theme='dark'");await shot('emoji-dark');await js("document.documentElement.dataset.theme='light'");await run('upload');await shot('uploaded');await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});await run('restored');win.setSize(390,820);await shot('mobile');if(!await js('document.documentElement.scrollWidth===innerWidth'))throw Error('Mobile overflow');win.setSize(1120,820);await shot('emoji-final');const titlePoint=await run('heading-add');win.webContents.sendInputEvent({type:'mouseMove',x:1,y:1});await run('heading-hidden');await shot('heading-idle');win.webContents.sendInputEvent({type:'mouseMove',...titlePoint});await run('heading-visible');await shot('heading-add');win.webContents.sendInputEvent({type:'mouseMove',x:1,y:1});await run('heading-hidden');await run('heading-choose');await shot('heading-emoji');await run('heading-open');await run('upload');await run('heading-image');await shot('heading-image');await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});await run('heading-image');win.setSize(390,820);await shot('heading-mobile');if(!await js('document.documentElement.scrollWidth===innerWidth'))throw Error('Title icon mobile overflow');win.setSize(1120,820);await run('heading-remove');console.log('Note icons: PASS (independent target, search, undo/redo, upload validation, originals, reload, Remove, focus, heading add/emoji/upload/remove/undo/reload, dark/mobile)');${process.argv.includes("--interactive") ? "win.show();win.focus();" : "app.exit(0);"}}
catch(error){console.error(error);await shot('failure');app.exit(1);}});${process.argv.includes("--interactive") ? "" : "setTimeout(()=>app.exit(1),45000);"}
`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  cwd: root,
  env,
  stdio: "inherit",
});
const code = await new Promise((r) => child.once("exit", (c) => r(c ?? 1)));
await rm(output, { recursive: true, force: true });
process.exitCode = code;
