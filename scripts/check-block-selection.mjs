import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/block-selection");
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
async function check({ output }) {
  const { app, BrowserWindow } = require("electron");
  const assert = require("node:assert/strict"),
    path = require("node:path");
  app.setPath("userData", path.join(output, "profile"));
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1000,
    height: 760,
    show: false,
    webPreferences: { backgroundThrottling: false },
  });
  const js = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg)})`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn) => {
    for (let i = 0; i < 150; i++) {
      if (await js(fn)) return;
      await wait(40);
    }
    throw Error("Timed out: " + fn);
  };
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await wait(80);
  };
  const drag = async (from, to, quick = false) => {
    win.webContents.sendInputEvent({ type: "mouseMove", x: from.x, y: from.y });
    win.webContents.sendInputEvent({
      type: "mouseDown",
      x: from.x,
      y: from.y,
      button: "left",
      clickCount: 1,
    });
    for (let i = 1; i <= 8; i++) {
      win.webContents.sendInputEvent({
        type: "mouseMove",
        x: Math.round(from.x + ((to.x - from.x) * i) / 8),
        y: Math.round(from.y + ((to.y - from.y) * i) / 8),
        button: "left",
        modifiers: ["leftButtonDown"],
      });
      if (!quick) await wait(18);
    }
    if (!quick) await wait(50);
    win.webContents.sendInputEvent({
      type: "mouseUp",
      x: to.x,
      y: to.y,
      button: "left",
      clickCount: 1,
    });
    await wait(70);
  };
  try {
    await win.loadFile(path.join(output, "index.html"), { hash: "/notes" });
    await until(() => !!document.querySelector('[aria-label="新建文稿"]'));
    await js(() => document.querySelector('[aria-label="新建文稿"]').click());
    await until(
      async () =>
        !!(await window.canvasFixture.repository("local-device").load()),
    );
    await wait(1000);
    await js(async () => {
      const repo = window.canvasFixture.repository("local-device"),
        doc = await repo.load();
      const rev = doc.revision;
      doc.revision++;
      doc.blocks.push(
        {
          id: "test.marquee.text",
          type: "markdown",
          source: "First paragraph\n\nSecond paragraph\n\nThird paragraph",
        },
        {
          id: "test.marquee.code",
          type: "markdown",
          source:
            "```js\nconst x = 1;\n```\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\nLast paragraph",
        },
      );
      doc.blocks.push({
        id: "test.marquee.canvas",
        type: "canvas",
        scene: {
          schema: "nomi-document-ir/draft-1",
          id: "test.scene",
          title: "Canvas",
          revision: 1,
          notes: [],
          blocks: [],
          assets: [],
          board: { id: "test.board", placements: [] },
        },
      });
      doc.notes.push({
        id: "test.marquee",
        title: "Block selection",
        blocks: [
          "test.marquee.text",
          "interactive.temperature",
          "test.marquee.code",
          "test.marquee.canvas",
        ],
      });
      await repo.save(doc, [], rev);
      location.hash = "/notes?note=test.marquee";
    });
    await win.reload();
    await until(
      () =>
        document.querySelector(".writing-title")?.value === "Block selection",
    );
    const paragraphPoints = (reverse = false) =>
      js((reverse) => {
        const ps = document.querySelectorAll(
            '[data-writing-block="test.marquee.text"] .tiptap > p',
          ),
          a = ps[1].getBoundingClientRect(),
          b = ps[2].getBoundingClientRect();
        return reverse
          ? {
              from: {
                x: Math.round(b.right + 18),
                y: Math.round(b.bottom - 2),
              },
              to: { x: Math.round(a.left + 25), y: Math.round(a.top + 2) },
            }
          : {
              from: { x: Math.round(a.left - 24), y: Math.round(a.top + 2) },
              to: { x: Math.round(b.left + 100), y: Math.round(b.bottom - 2) },
            };
      }, reverse);
    let pts = await paragraphPoints();
    await drag(pts.from, pts.to);
    assert.equal(
      await js(() => document.querySelectorAll("[data-block-selected]").length),
      2,
    );
    const copied = await js(() => {
      const data = new DataTransfer();
      document.activeElement.dispatchEvent(
        new ClipboardEvent("copy", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
      return {
        plain: data.getData("text/plain"),
        payload: data.getData("application/x-nomi-blocks"),
      };
    });
    assert.equal(copied.plain, "Second paragraph\n\nThird paragraph");
    require("node:fs").writeFileSync(
      path.join(output, "paragraph-selection.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await key("Backspace");
    await until(
      () =>
        document.querySelector(
          '[data-writing-block="test.marquee.text"] .tiptap',
        ).textContent === "First paragraph",
    );
    await key("z", ["meta"]);
    await until(
      () =>
        document.querySelectorAll(
          '[data-writing-block="test.marquee.text"] .tiptap > p',
        ).length === 3,
    );
    pts = await paragraphPoints(true);
    await drag(pts.from, pts.to, true);
    assert.equal(
      await js(() => document.querySelectorAll("[data-block-selected]").length),
      2,
    );
    await key("Escape");
    assert.equal(
      await js(() => document.querySelectorAll("[data-block-selected]").length),
      0,
    );
    // Mixed selection from the third paragraph into the interactive block.
    // Hosted macOS screens can clamp the requested window height. Bring both
    // ends into view instead of clamping the drag above the target block.
    await js(() => {
      document
        .querySelector(
          '[data-writing-block="test.marquee.text"] .tiptap > p:last-child',
        )
        .scrollIntoView({ block: "center", behavior: "instant" });
    });
    await until(() => {
      const embed = document
        .querySelector('[data-writing-block="interactive.temperature"]')
        .getBoundingClientRect();
      return embed.top + 30 < innerHeight - 100;
    });
    pts = await js(() => {
      const p = document
          .querySelector(
            '[data-writing-block="test.marquee.text"] .tiptap > p:last-child',
          )
          .getBoundingClientRect(),
        embed = document
          .querySelector('[data-writing-block="interactive.temperature"]')
          .getBoundingClientRect();
      return {
        from: { x: Math.round(p.left - 24), y: Math.round(p.top + 2) },
        to: {
          x: Math.round(p.left + 150),
          y: Math.round(Math.min(innerHeight - 100, embed.top + 80)),
        },
      };
    });
    await drag(pts.from, pts.to);
    assert.equal(
      await js(
        () =>
          !!document.querySelector(
            '[data-writing-block="interactive.temperature"][data-block-selected]',
          ),
      ),
      true,
    );
    const mixed = await js(() => {
      const data = new DataTransfer();
      document.activeElement.dispatchEvent(
        new ClipboardEvent("cut", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
      return data.getData("application/x-nomi-blocks");
    });
    assert.equal(JSON.parse(mixed).document.blocks.length, 2);
    await until(
      () =>
        !document.querySelector(
          '[data-writing-block="interactive.temperature"]',
        ),
    );
    await key("z", ["meta"]);
    await until(
      () =>
        !!document.querySelector(
          '[data-writing-block="interactive.temperature"]',
        ),
    );
    // Exact mixed-block paste into a text cursor, preserving independent IDs/programs.
    await js((payload) => {
      const e = document.querySelector(".tiptap");
      e.focus();
      const r = document.createRange();
      r.selectNodeContents(e);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      const data = new DataTransfer();
      data.setData("application/x-nomi-blocks", payload);
      e.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    }, mixed);
    await until(
      () => document.querySelectorAll(".canvas-interactive").length === 2,
    );
    await key("z", ["meta"]);
    await until(
      () => document.querySelectorAll(".canvas-interactive").length === 1,
    );
    // Scroll-edge marquee reaches the code, table and canvas as complete units.
    await js(() => {
      document.querySelector(".notes-scroll").scrollTop = 0;
    });
    pts = await paragraphPoints();
    const bottom = await js(() =>
      Math.floor(
        document.querySelector(".notes-scroll").getBoundingClientRect().bottom -
          2,
      ),
    );
    win.webContents.sendInputEvent({ type: "mouseMove", ...pts.from });
    win.webContents.sendInputEvent({
      type: "mouseDown",
      ...pts.from,
      button: "left",
      clickCount: 1,
    });
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: pts.to.x,
      y: bottom,
      button: "left",
      modifiers: ["leftButtonDown"],
    });
    await until(
      () =>
        !!document.querySelector(
          '[data-writing-block="test.marquee.canvas"][data-block-selected]',
        ),
    );
    win.webContents.sendInputEvent({
      type: "mouseUp",
      x: pts.to.x,
      y: bottom,
      button: "left",
      clickCount: 1,
    });
    assert.ok(
      await js(() => document.querySelector(".notes-scroll").scrollTop > 0),
    );
    assert.ok(
      await js(
        () =>
          !!document.querySelector(
            '[data-writing-block="test.marquee.code"] [data-block-selected]',
          ),
      ),
    );
    await key("Backspace");
    await until(
      () =>
        !document.querySelector('[data-writing-block="test.marquee.canvas"]'),
    );
    await key("z", ["meta"]);
    await until(
      () =>
        !!document.querySelector('[data-writing-block="test.marquee.canvas"]'),
    );
    await js(() => {
      document.querySelector(".notes-scroll").scrollTop = 0;
    });
    // Content drag remains native text selection rather than block marquee.
    pts = await js(() => {
      const r = document.querySelector(".tiptap > p").getBoundingClientRect();
      return {
        from: { x: Math.round(r.left + 5), y: Math.round(r.top + 12) },
        to: { x: Math.round(r.left + 70), y: Math.round(r.top + 12) },
      };
    });
    await drag(pts.from, pts.to);
    assert.equal(
      await js(() => document.querySelectorAll("[data-block-selected]").length),
      0,
    );
    assert.ok(await js(() => getSelection().toString().length > 0));
    console.log(
      "Block selection PASS: left/right marquee, partial paragraphs, mixed copy/cut/paste, delete/undo, Escape, native text selection",
    );
    app.exit(0);
  } catch (e) {
    console.error(e);
    require("node:fs").writeFileSync(
      path.join(output, "failure.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    app.exit(1);
  }
}
await writeFile(
  join(output, "main.cjs"),
  `(${check})(${JSON.stringify({ output })});setTimeout(()=>require('electron').app.exit(1),45000)`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  env,
  stdio: "inherit",
});
process.exitCode = await new Promise((r) => child.on("exit", (c) => r(c ?? 1)));
console.log(output);
