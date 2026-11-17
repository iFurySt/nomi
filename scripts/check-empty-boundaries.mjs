import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/empty-boundaries");
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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, arg) => {
    for (let i = 0; i < 180; i++) {
      if (await js(fn, arg)) return;
      await wait(40);
    }
    throw Error("Timed out: " + fn);
  };
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await wait(90);
  };
  const caret = async (id, end = false) => {
    await js(
      ({ id, end }) => {
        const el = document.querySelector(
          `[data-writing-block="${id}"] .tiptap`,
        );
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(!end);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      },
      { id, end },
    );
    await wait(100);
  };
  try {
    await win.loadFile(path.join(output, "index.html"), { hash: "/notes" });
    await until(() => !!document.querySelector('[aria-label="新建文稿"]'));
    await js(() => document.querySelector('[aria-label="新建文稿"]').click());
    await wait(1200);
    await js(async () => {
      const repo = window.canvasFixture.repository("local-device"),
        doc = await repo.load(),
        rev = doc.revision;
      doc.revision++;
      doc.blocks.push(
        {
          id: "boundary.before",
          type: "markdown",
          source: "Before the interactive block",
        },
        {
          id: "boundary.after",
          type: "markdown",
          source: "After the interactive block",
        },
        { id: "boundary.empty", type: "markdown", source: "" },
        { id: "boundary.peer", type: "markdown", source: "" },
      );
      doc.notes.push({
        id: "boundary.note",
        title: "Empty boundary regression",
        blocks: [
          "boundary.before",
          "interactive.temperature",
          "boundary.after",
        ],
      });
      doc.notes.push({
        id: "boundary.single",
        title: "Standalone empty row",
        blocks: [
          "boundary.before",
          "interactive.temperature",
          "boundary.empty",
          "boundary.peer",
        ],
      });
      doc.notes.push({
        id: "boundary.draft",
        title: "Virtual input gaps",
        blocks: ["interactive.temperature"],
      });
      doc.blocks.push({
        id: "boundary.canvas",
        type: "canvas",
        scene: {
          schema: "nomi-document-ir/draft-1",
          id: "boundary.scene",
          title: "Canvas",
          revision: 1,
          notes: [],
          blocks: [],
          assets: [],
          board: { id: "boundary.board", placements: [] },
        },
      });
      const blob = await window.canvasFixture.image();
      const sha256 = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
        ),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      const asset = {
        id: "boundary.asset",
        name: "test.png",
        mime: "image/png",
        bytes: blob.size,
        sha256,
        width: 960,
        height: 540,
      };
      doc.assets.push(asset);
      doc.blocks.push({ id: "boundary.image", type: "image", asset: asset.id });
      for (const kind of ["canvas", "image"])
        doc.notes.push({
          id: `boundary.${kind}.note`,
          title: `${kind} boundary`,
          blocks: ["boundary.before", `boundary.${kind}`, "boundary.after"],
        });
      await repo.save(doc, [{ asset, blob }], rev);
      location.hash = "/notes?note=boundary.note";
    });
    await win.reload();
    await until(
      () =>
        document.querySelector(".writing-title")?.value ===
        "Empty boundary regression",
    );
    const spacing = await js(() => {
      const before = document
        .querySelector(
          '[data-writing-block="boundary.before"] .tiptap > :last-child',
        )
        .getBoundingClientRect();
      const embed = document
        .querySelector('[data-writing-block="interactive.temperature"]')
        .getBoundingClientRect();
      const after = document
        .querySelector(
          '[data-writing-block="boundary.after"] .tiptap > :first-child',
        )
        .getBoundingClientRect();
      return {
        above: embed.top - before.bottom,
        below: after.top - embed.bottom,
      };
    });
    assert(
      Math.abs(spacing.above - spacing.below) < 1,
      JSON.stringify(spacing),
    );
    await caret("boundary.after");
    await key("Enter");
    await key("Up");
    assert.equal(
      await js(
        () =>
          document.querySelector(
            '[data-writing-block="boundary.after"] .tiptap',
          ).childElementCount,
      ),
      2,
    );
    // IME deletion must remain owned by the IME.
    await js(() =>
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Backspace",
          bubbles: true,
          cancelable: true,
          isComposing: true,
        }),
      ),
    );
    assert.equal(
      await js(
        () =>
          document.querySelector(
            '[data-writing-block="boundary.after"] .tiptap',
          ).childElementCount,
      ),
      2,
    );
    await key("Backspace");
    assert.equal(
      await js(
        () =>
          document.querySelector(
            '[data-writing-block="boundary.after"] .tiptap',
          ).childElementCount,
      ),
      1,
    );
    await until(() =>
      document
        .querySelector('[data-writing-block="interactive.temperature"]')
        ?.hasAttribute("data-block-selected"),
    );
    assert.equal(
      await js(() => document.activeElement.classList.contains("notes-scroll")),
      true,
    );
    await js(() =>
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Backspace",
          repeat: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    assert.equal(
      await js(() => document.querySelectorAll(".canvas-interactive").length),
      1,
    );
    await key("Backspace");
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
    await key("z", ["meta"]);
    await until(
      () =>
        document.querySelector('[data-writing-block="boundary.after"] .tiptap')
          .childElementCount === 2,
    );
    await key("z", ["meta", "shift"]);
    await until(
      () =>
        document.querySelector('[data-writing-block="boundary.after"] .tiptap')
          .childElementCount === 1,
    );
    // A second Backspace at nonempty start must not consume content or the interactive block.
    await caret("boundary.after");
    await key("Backspace");
    assert.equal(
      await js(
        () =>
          document.querySelector(
            '[data-writing-block="boundary.after"] .tiptap',
          ).textContent,
      ),
      "After the interactive block",
    );
    await caret("boundary.before", true);
    await key("Enter");
    await wait(100);
    await key("Delete");
    assert.equal(
      await js(
        () =>
          document.querySelector(
            '[data-writing-block="boundary.before"] .tiptap',
          ).childElementCount,
      ),
      1,
    );
    assert.equal(
      await js(() => document.querySelectorAll(".canvas-interactive").length),
      1,
    );
    await wait(1300);
    await win.reload();
    await until(
      () =>
        document.querySelector('[data-writing-block="boundary.after"] .tiptap')
          ?.childElementCount === 1,
    );
    assert.equal(
      await js(
        () =>
          document.querySelector(
            '[data-writing-block="boundary.before"] .tiptap',
          ).childElementCount,
      ),
      1,
    );
    require("node:fs").writeFileSync(
      path.join(output, "deleted-boundaries.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(() =>
      document
        .querySelector('[data-writing-block="boundary.after"]')
        .scrollIntoView({ block: "center" }),
    );
    await wait(100);
    require("node:fs").writeFileSync(
      path.join(output, "deleted-trailing-boundary.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(() => (location.hash = "/notes?note=boundary.single"));
    await until(
      () =>
        !!document.querySelector(
          '[data-writing-block="boundary.empty"] .tiptap',
        ),
    );
    await caret("boundary.empty");
    await key("Backspace");
    await until(
      () => !document.querySelector('[data-writing-block="boundary.empty"]'),
    );
    assert.equal(
      await js(
        () =>
          document
            .querySelector("[data-collapsed-gap]")
            ?.getBoundingClientRect().height,
      ),
      0,
    );
    assert.equal(
      await js(() =>
        document.activeElement?.classList.contains("notes-scroll"),
      ),
      true,
    );
    await key("z", ["meta"]);
    await until(
      () =>
        !!document.querySelector(
          '[data-writing-block="boundary.empty"] .tiptap',
        ),
    );
    await caret("boundary.empty");
    await key("Delete");
    await until(
      () => !document.querySelector('[data-writing-block="boundary.empty"]'),
    );
    await wait(1300);
    const order = await js(
      async () =>
        (
          await window.canvasFixture.repository("local-device").load()
        ).notes.find((n) => n.id === "boundary.single").blocks,
    );
    assert(
      !order.includes("boundary.empty") && !order.includes("boundary.peer"),
    );
    await js(() => (location.hash = "/notes?note=boundary.draft"));
    await until(
      () =>
        document.querySelector(".writing-title")?.value ===
        "Virtual input gaps",
    );
    const gaps = await js(() =>
      [...document.querySelectorAll(".writing-block-markdown")].map(
        (el) => el.dataset.writingBlock,
      ),
    );
    await caret(gaps[0]);
    await key("Delete");
    await caret(gaps[1]);
    await key("Backspace");
    assert.equal(
      await js(
        () =>
          [...document.querySelectorAll("[data-collapsed-gap]")].filter(
            (el) => el.getBoundingClientRect().height === 0,
          ).length,
      ),
      2,
    );
    // Explicitly entering a collapsed input makes writing possible again.
    await caret(gaps[1]);
    await win.webContents.insertText("a");
    await until(() =>
      [...document.querySelectorAll(".tiptap")].some(
        (el) => el.textContent === "a",
      ),
    );
    assert.equal(
      await js(() => document.querySelectorAll(".canvas-interactive").length),
      1,
    );
    for (const kind of ["canvas", "image"]) {
      await js(
        (kind) => (location.hash = `/notes?note=boundary.${kind}.note`),
        kind,
      );
      await until(
        (kind) =>
          document.querySelector(".writing-title")?.value ===
          `${kind} boundary`,
        kind,
      );
      await caret("boundary.after");
      await key("Enter");
      await key("Up");
      await key("Backspace");
      assert.equal(
        await js(
          (kind) =>
            document
              .querySelector(`[data-writing-block="boundary.${kind}"]`)
              ?.hasAttribute("data-block-selected"),
          kind,
        ),
        true,
        kind + " selected",
      );
      if (kind === "image") {
        await js(() =>
          document
            .querySelector("[data-block-selected]")
            .scrollIntoView({ block: "center" }),
        );
        await wait(100);
        require("node:fs").writeFileSync(
          path.join(output, "selected-image-boundary.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
      }
      await key("Backspace");
      assert.equal(
        await js(
          (kind) =>
            !!document.querySelector(`[data-writing-block="boundary.${kind}"]`),
          kind,
        ),
        false,
        kind + " deleted",
      );
      assert.equal(
        await js(
          () =>
            document.querySelector(
              '[data-writing-block="boundary.after"] .tiptap',
            ).textContent,
        ),
        "After the interactive block",
      );
      await key("z", ["meta"]);
      assert.equal(
        await js(
          (kind) =>
            !!document.querySelector(`[data-writing-block="boundary.${kind}"]`),
          kind,
        ),
        true,
        kind + " restored",
      );
    }
    console.log(
      "Empty boundaries PASS: balanced embed spacing, two-step selection/delete for interactive/canvas/image, repeat guard, leading Backspace, trailing Delete, IME guard, undo/redo, persistence, standalone empty peers, virtual gaps, explicit re-entry; interactive content preserved",
    );
    app.exit(0);
  } catch (e) {
    console.error(e);
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
