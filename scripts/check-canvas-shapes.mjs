import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/canvas-shapes");
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

// Native pointer matrix in a disposable profile. Never opens the user's library.
async function checkShapes({ output, toolsOnly, catalogOnly }) {
  const { app, BrowserWindow } = require("electron");
  const { writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  app.setPath("userData", join(output, "profile"));
  app.disableHardwareAcceleration();
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1300,
    height: 950,
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
  const assert = (ok, msg) => {
    if (!ok) throw Error(msg);
  };
  const near = (a, b, msg) =>
    assert(Math.abs(a - b) < 1.1, `${msg}: ${a} != ${b}`);
  const until = async (fn, msg) => {
    for (let i = 0; i < 150; i++) {
      if (await fn()) return;
      await wait(40);
    }
    throw Error(msg);
  };
  const shot = async (name) =>
    writeFileSync(
      join(output, name + ".png"),
      (await win.webContents.capturePage()).toPNG(),
    );
  const key = async (keyCode, modifiers = []) => {
    for (const type of ["keyDown", "keyUp"])
      win.webContents.sendInputEvent({ type, keyCode, modifiers });
    await wait(35);
  };
  let pressed = false;
  const mouse = (type, p, modifiers = 0) => {
    if (type === "mousePressed") pressed = true;
    if (type === "mouseReleased") pressed = false;
    return win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type,
      ...p,
      button: type === "mouseMoved" ? "none" : "left",
      buttons: pressed ? 1 : 0,
      clickCount: 1,
      modifiers,
    });
  };
  const box = (selector) =>
    run((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, selector);
  const click = async (selector) => {
    const b = await box(selector),
      p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await mouse("mouseMoved", p);
    await mouse("mousePressed", p);
    await mouse("mouseReleased", p);
    await wait(40);
  };
  const drag = async (a, b, mods = 0, during) => {
    await mouse("mouseMoved", a, mods);
    await mouse("mousePressed", a, mods);
    for (let i = 1; i <= 6; i++) {
      await mouse(
        "mouseMoved",
        { x: a.x + ((b.x - a.x) * i) / 6, y: a.y + ((b.y - a.y) * i) / 6 },
        mods,
      );
      await wait(12);
    }
    if (during) await during();
    await mouse("mouseReleased", b, mods);
    await wait(55);
  };
  const cards = () =>
    run(() =>
      [...document.querySelectorAll(".shape-card")].map((e) => {
        const r = e.getBoundingClientRect();
        return {
          id: e.dataset.placement,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        };
      }),
    );
  const camera = () =>
    run(() =>
      JSON.parse(document.querySelector(".canvas-viewport").dataset.camera),
    );
  const arm = async (shape) => {
    if (shape === "text") {
      await click('[aria-label="文本工具"]');
      return;
    }
    await mouse("mouseMoved", { x: 1100, y: 800 });
    const b = await box('[aria-label="添加形状"]');
    await mouse("mouseMoved", { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    await until(
      () => run(() => !!document.querySelector("[data-create-shape]")),
      "shape menu",
    );
    await click(`[data-create-shape="${shape}"]`);
  };
  const undo = () => key("z", ["meta"]);
  const redo = () => key("z", ["meta", "shift"]);
  let current = "setup";
  const report = [];
  try {
    if (catalogOnly) {
      win.setSize(1300, 1240);
      await win.loadFile(join(output, "index.html"), {
        query: { "shape-catalog": "1" },
      });
      await wait(500);
      await shot("shape-catalog");
      app.exit(0);
      return;
    }
    await win.loadFile(join(output, "index.html"), { hash: "/canvas" });
    await until(
      () => run(() => !!document.querySelector(".canvas-viewport")),
      "viewport",
    );
    await run(() =>
      document.querySelector('[aria-label="编辑文档 DSL"]').click(),
    );
    await until(
      () => run(() => !!document.querySelector('[aria-label="文档 DSL 源码"]')),
      "DSL",
    );
    await run(() => {
      const el = document.querySelector('[aria-label="文档 DSL 源码"]'),
        d = JSON.parse(el.value);
      d.board.placements = [];
      d.board.connectors = [];
      d.blocks = [];
      d.notes = [];
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(el, JSON.stringify(d));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(40);
    await run(() =>
      [...document.querySelectorAll(".canvas-dsl-actions button")]
        .find((b) => b.textContent.includes("应用"))
        .click(),
    );
    await until(
      () =>
        run(
          () =>
            !document.querySelector('[aria-label="文档 DSL 源码"]') &&
            !document.querySelector("[data-placement]"),
        ),
      "clear",
    );
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await arm("rectangle");
    // The menu closes after selection; fetch the complete catalog by hovering again.
    const menu = await box('[aria-label="添加形状"]');
    await mouse("mouseMoved", { x: menu.x + 15, y: menu.y + 15 });
    await until(
      () =>
        run(
          () => document.querySelectorAll("[data-create-shape]").length === 27,
        ),
      "catalog",
    );
    const catalog = await run(() =>
      [...document.querySelectorAll("[data-create-shape]")].map(
        (e) => e.dataset.createShape,
      ),
    );
    catalog.push("text");
    await key("Escape");
    current = "palette tooltips";
    for (const [selector, label, shortcut] of [
      ['[data-create-shape="diamond"]', "菱形", "D"],
      ['[data-create-shape="rectangle"]', null, null],
      ['[data-line-mode="line"]', "直线", "L"],
      ['[data-line-mode="curve"]', "曲线箭头", null],
    ]) {
      await mouse("mouseMoved", { x: 1000, y: 700 });
      await wait(220);
      const trigger = await box(
        selector.includes("line-mode")
          ? '[aria-label="连接工具"]'
          : '[aria-label="添加形状"]',
      );
      await mouse("mouseMoved", { x: trigger.x + 15, y: trigger.y + 15 });
      await wait(80);
      assert(
        await run((s) => !!document.querySelector(s), selector),
        "palette item missing " + selector,
      );
      const item = await box(selector);
      await mouse("mouseMoved", {
        x: item.x + item.width / 2,
        y: item.y + item.height / 2,
      });
      await until(
        () => run(() => !!document.querySelector(".nomi-tooltip")),
        "item tooltip",
      );
      const tip = await run(() => {
        const el = document.querySelector(".nomi-tooltip");
        return {
          text: el.textContent,
          key: el.querySelector("kbd")?.textContent ?? null,
        };
      });
      assert(!label || tip.text.includes(label), "tooltip label");
      assert(tip.key === shortcut, "tooltip shortcut");
      await wait(100);
      await shot(`tooltip-${selector.match(/="(.*?)"/)[1]}`);
      await mouse("mouseMoved", { x: 1000, y: 700 });
      await wait(220);
    }
    current = "cursor placement";
    await arm("diamond");
    await mouse("mouseMoved", { x: 600, y: 400 });
    await wait(40);
    const ghost = await box(".canvas-shape-cursor");
    const z = (await camera()).zoom;
    near(ghost.x, 600, "ghost left");
    near(ghost.y, 400, "ghost top");
    near(ghost.width, 180 * z, "ghost default width");
    near(ghost.height, 120 * z, "ghost default height");
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".canvas-shape-cursor"))
            .visibility === "visible",
      ),
      "ghost visible",
    );
    assert((await cards()).length === 0, "hover must not create content");
    await shot("shape-cursor");
    await mouse("mousePressed", { x: 600, y: 400 });
    await mouse("mouseReleased", { x: 600, y: 400 });
    await wait(60);
    const placed = (await cards())[0];
    near(placed.x, ghost.x, "click matches ghost x");
    near(placed.y, ghost.y, "click matches ghost y");
    near(placed.width, 180 * z, "click width");
    near(placed.height, 120 * z, "click height");
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".canvas-shape-cursor"))
            .visibility === "hidden",
      ),
      "ghost hidden after placement",
    );
    await undo();
    await key("d");
    await mouse("mouseMoved", { x: 610, y: 410 });
    assert(
      await run(
        () =>
          document.querySelector(".canvas-shape-cursor").dataset.shape ===
          "diamond",
      ),
      "D selects diamond",
    );
    await key("Escape");
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".canvas-shape-cursor"))
            .visibility === "hidden",
      ),
      "Esc clears ghost",
    );
    if (toolsOnly) {
      console.log("Shape cursor and tooltips passed");
      app.exit(0);
      return;
    }
    for (const shape of catalog) {
      current = shape;
      const z = (await camera()).zoom;
      for (const [sx, sy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        await arm(shape);
        assert(
          (await cards()).length === 0,
          shape + " palette inserted eagerly",
        );
        const a = { x: 620, y: 420 },
          b = { x: 620 + sx * 150, y: 420 + sy * 90 };
        await drag(a, b, 0, async () => {
          assert(
            (await cards()).length === 0,
            shape + " committed before release",
          );
          assert(
            await run(() => !!document.querySelector(".canvas-draw-preview")),
            shape + " preview missing",
          );
        });
        if (shape === "text") await key("Escape");
        let c = (await cards())[0];
        assert(c, shape + " missing");
        assert(
          await run(
            () =>
              document.querySelectorAll(".shape-card .canvas-card-header")
                .length === 0,
          ),
          shape + " legacy header returned",
        );
        near(c.x, Math.min(a.x, b.x), shape + " origin x");
        near(c.y, Math.min(a.y, b.y), shape + " origin y");
        near(c.width, 150, shape + " width");
        near(c.height, 90, shape + " height");
        await undo();
        assert((await cards()).length === 0, shape + " draw undo");
        await redo();
        assert((await cards()).length === 1, shape + " redo");
        await undo();
      }
      await arm(shape);
      await drag({ x: 400, y: 300 }, { x: 550, y: 390 }, 8);
      if (shape === "text") await key("Escape");
      let c = (await cards())[0];
      near(c.width, c.height, shape + " Shift square");
      await undo();
      await arm(shape);
      await mouse("mousePressed", { x: 400, y: 300 });
      await mouse("mouseMoved", { x: 500, y: 400 });
      await key("Escape");
      await mouse("mouseReleased", { x: 500, y: 400 });
      assert((await cards()).length === 0, shape + " Esc cancel");
      // Target and dragged shape: left-edge snap, Alt escape and Shift axis lock.
      await arm("rectangle");
      await drag({ x: 400, y: 210 }, { x: 580, y: 310 });
      await arm(shape);
      await drag({ x: 700, y: 440 }, { x: 850, y: 530 });
      if (shape === "text") await key("Escape");
      c = (await cards())[1];
      const at = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
      await drag(at, { x: at.x + 400 - c.x + 3, y: at.y }, 0, async () =>
        assert(
          await run(() => !!document.querySelector(".canvas-guides line")),
          shape + " missing alignment guide",
        ),
      );
      let moved = (await cards())[1];
      near(moved.x, 400, shape + " edge snap");
      await undo();
      await drag(at, { x: at.x + 400 - c.x + 3, y: at.y }, 1);
      moved = (await cards())[1];
      near(moved.x, 403, shape + " Alt bypass");
      await undo();
      await drag(at, { x: at.x + 50, y: at.y + 17 }, 8);
      moved = (await cards())[1];
      near(moved.y, c.y, shape + " Shift axis");
      await undo();
      // Every edge and corner, with the opposite side fixed and correct cursor.
      await click(`[data-placement="${c.id}"] .canvas-shape-content`);
      for (const direction of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
        const selector = `[data-placement="${c.id}"] [data-resize="${direction}"]`,
          h = await box(selector),
          start = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
        const css = await run(
          (s) => getComputedStyle(document.querySelector(s)).cursor,
          selector,
        );
        assert(css.includes("resize"), shape + " cursor " + direction);
        await drag(
          start,
          {
            x:
              start.x +
              (direction.includes("w")
                ? -24
                : direction.includes("e")
                  ? 24
                  : 0),
            y:
              start.y +
              (direction.includes("n")
                ? -18
                : direction.includes("s")
                  ? 18
                  : 0),
          },
          1,
        );
        const r = (await cards())[1];
        near(
          r.width,
          c.width +
            (direction.includes("w") || direction.includes("e") ? 24 : 0),
          shape + " resize " + direction,
        );
        near(
          r.height,
          c.height +
            (direction.includes("n") || direction.includes("s") ? 18 : 0),
          shape + " resize h " + direction,
        );
        near(
          r.x + (direction.includes("w") ? r.width : 0),
          c.x + (direction.includes("w") ? c.width : 0),
          shape + " fixed x",
        );
        near(
          r.y + (direction.includes("n") ? r.height : 0),
          c.y + (direction.includes("n") ? c.height : 0),
          shape + " fixed y",
        );
        await undo();
      }
      await shot(shape);
      await undo();
      await undo();
      assert((await cards()).length === 0, shape + " cleanup");
      report.push({
        shape,
        quadrants: 4,
        shift: true,
        cancel: true,
        moveSnap: true,
        alt: true,
        axisLock: true,
        resizeHandles: 8,
        history: true,
        zoom: z,
      });
      console.log("Passed " + shape);
    }
    writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
    await shot("complete");
    await win.loadFile(join(output, "index.html"), {
      query: { "shape-catalog": "1" },
    });
    win.setSize(1300, 1240);
    await wait(500);
    await shot("shape-catalog");
    console.log(`All ${report.length} shapes passed`);
    app.exit(0);
  } catch (error) {
    console.error("Shape audit failed at " + current, error);
    await shot("failure");
    console.error(await run(() => document.body.innerText.slice(-1000)));
    app.exit(1);
  }
}
await writeFile(
  join(output, "main.cjs"),
  `(${checkShapes})(${JSON.stringify({ output, toolsOnly: process.argv.includes("--tools-only"), catalogOnly: process.argv.includes("--catalog-only") })});setTimeout(()=>require('electron').app.exit(1),300000);`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  stdio: "inherit",
  env,
});
process.exitCode = await new Promise((resolve) =>
  child.once("exit", (code) => resolve(code ?? 1)),
);
console.log(output);
