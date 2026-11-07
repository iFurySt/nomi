import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/tooltips");
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
  const run = async (fn, arg) => {
    const result = await win.webContents.executeJavaScript(`(async () => {
      try { return { value: await (${fn})(${JSON.stringify(arg)}) }; }
      catch (error) { return { error: error.stack }; }
    })()`);
    if (result.error) throw Error(result.error);
    return result.value;
  };
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
    await win.loadFile(join(output, "index.html"), { hash: "/canvas" });
    await until(() =>
      run(() => !!document.querySelector('[aria-label="平移工具"]')),
    );
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    const point = (selector) =>
      run((selector) => {
        const b = document.querySelector(selector).getBoundingClientRect();
        return {
          x: Math.round(b.x + b.width / 2),
          y: Math.round(b.y + b.height / 2),
        };
      }, selector);
    const move = async (selector) => {
      win.webContents.sendInputEvent({ type: "mouseMove", x: 1180, y: 880 });
      await wait(60);
      win.webContents.sendInputEvent({
        type: "mouseMove",
        ...(await point(selector)),
      });
      await until(() =>
        run((selector) => {
          const trigger = document.querySelector(selector);
          const description = document.getElementById(
            trigger.getAttribute("aria-describedby"),
          );
          const tip = description?.closest(".nomi-tooltip");
          return (
            !!tip &&
            tip.getBoundingClientRect().width > 0 &&
            tip.parentElement.style.transform.includes("translate")
          );
        }, selector),
      );
      await wait(120);
    };
    const verify = (selector) =>
      run((selector) => {
        const t = document.querySelector(".nomi-tooltip"),
          b = document.querySelector(selector);
        const r = t.getBoundingClientRect(),
          a = b.getBoundingClientRect(),
          css = getComputedStyle(t);
        if (Math.abs(r.left - a.right - 4) > 1)
          throw Error("Tooltip gap changed: " + (r.left - a.right));
        if (Math.abs(r.y + r.height / 2 - a.y - a.height / 2) > 1)
          throw Error("Tooltip is not centered");
        if (r.right > innerWidth - 7 || r.top < 7)
          throw Error("Tooltip outside viewport");
        if (!document.getElementById(b.getAttribute("aria-describedby")))
          throw Error("Missing accessible description");
        return {
          radius: css.borderRadius,
          font: css.font,
          fontWeight: css.fontWeight,
          padding: css.padding,
          background: css.backgroundColor,
        };
      }, selector);
    const nav = '.rail-destinations [aria-label="文稿"]';
    const hand = '[aria-label="平移工具"]';
    await move(nav);
    const navStyle = await verify(nav);
    assert(
      await run(() => document.activeElement === document.body),
      "Hover stole focus",
    );
    writeFileSync(
      join(output, "navigation-light.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await move(hand);
    assert(
      JSON.stringify(navStyle) === JSON.stringify(await verify(hand)),
      "Canvas and navigation styles differ",
    );
    assert(
      await run(
        () => document.querySelector(".nomi-tooltip kbd")?.textContent === "H",
      ),
      "Missing shortcut",
    );
    writeFileSync(
      join(output, "canvas-light.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await key("Escape");
    await until(() => run(() => !document.querySelector(".nomi-tooltip")));
    // Keyboard navigation keeps a genuine button, without an extra focusable wrapper.
    await run((s) => document.querySelector(s).focus(), hand);
    await until(() => run(() => !!document.querySelector(".nomi-tooltip")));
    await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
    });
    await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await wait(80);
    assert(
      await run(
        (s) =>
          document.querySelector(s).getAttribute("aria-pressed") === "true",
        hand,
      ),
      "Tooltip broke tool activation",
    );
    await until(() => run(() => !document.querySelector(".nomi-tooltip")));
    // Moving across adjacent menu choices must remove the old hint immediately.
    await run(() => document.activeElement.blur());
    win.webContents.sendInputEvent({
      type: "mouseMove",
      ...(await point('[aria-label="添加形状"]')),
    });
    await until(() =>
      run(() => !!document.querySelector('[data-create-shape="diamond"]')),
    );
    await run(() => {
      window.tooltipOverlap = false;
      window.tooltipObserver = new MutationObserver(() => {
        if (document.querySelectorAll(".nomi-tooltip").length > 1)
          window.tooltipOverlap = true;
      });
      window.tooltipObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
    const hoverChoice = async (shape) => {
      const selector = `[data-create-shape="${shape}"]`;
      win.webContents.sendInputEvent({
        type: "mouseMove",
        ...(await point(selector)),
      });
      await until(() =>
        run(
          (selector) =>
            !!document
              .querySelector(selector)
              ?.getAttribute("aria-describedby"),
          selector,
        ),
      );
      await wait(120);
    };
    await hoverChoice("rounded-rectangle");
    const oldHint = await run(
      () => document.querySelector(".nomi-tooltip span").textContent,
    );
    win.webContents.sendInputEvent({
      type: "mouseMove",
      ...(await point('[data-create-shape="diamond"]')),
    });
    await wait(40);
    assert(
      await run(
        (oldHint) =>
          ![...document.querySelectorAll(".nomi-tooltip span")].some(
            (e) => e.textContent === oldHint,
          ),
        oldHint,
      ),
      "Previous shape hint lingers after pointer leaves",
    );
    await hoverChoice("diamond");
    assert(
      await run(
        () => document.querySelector(".nomi-tooltip kbd")?.textContent === "D",
      ),
      "Shape shortcut missing",
    );
    assert(
      await run((style) => {
        const tip = document.querySelector(".nomi-tooltip"),
          css = getComputedStyle(tip);
        return (
          css.borderRadius === style.radius &&
          css.font === style.font &&
          !tip.querySelector("svg")
        );
      }, navStyle),
      "Shape hint does not use shared styling",
    );
    writeFileSync(
      join(output, "shape-menu.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    for (let i = 0; i < 12; i++) {
      const shape = ["rectangle", "diamond", "rounded-rectangle"][i % 3];
      win.webContents.sendInputEvent({
        type: "mouseMove",
        ...(await point(`[data-create-shape="${shape}"]`)),
      });
      await wait(35);
    }
    await hoverChoice("diamond");
    assert(
      await run(
        () =>
          !window.tooltipOverlap &&
          document.querySelectorAll(".nomi-tooltip").length === 1,
      ),
      "Adjacent shape hints overlap",
    );
    win.webContents.sendInputEvent({ type: "mouseMove", x: 1180, y: 880 });
    await wait(40);
    assert(
      await run(() => !document.querySelector(".nomi-tooltip")),
      "Hint remains after leaving palette",
    );
    await run(() => window.tooltipObserver.disconnect());
    await key("Escape");
    await run(() => (document.documentElement.dataset.theme = "dark"));
    await move(nav);
    writeFileSync(
      join(output, "navigation-dark.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    const profile = '.rail-profile[aria-label="Account menu"]';
    await move(profile);
    for (const type of ["mouseDown", "mouseUp"])
      win.webContents.sendInputEvent({
        type,
        button: "left",
        clickCount: 1,
        ...(await point(profile)),
      });
    await until(() => run(() => !!document.querySelector('[role="menu"]')));
    assert(
      await run(() => !document.querySelector(".nomi-tooltip")),
      "Hint overlaps opened menu",
    );
    await key("Escape");
    await run(() => (location.hash = "/notes"));
    await until(() =>
      run(() => !!document.querySelector(".notes-icon-button")),
    );
    await move(".notes-icon-button");
    assert(
      await run(
        () =>
          document.querySelector(".nomi-tooltip span")?.textContent ===
          "Change icon",
      ),
      "Note hint missing",
    );
    await run(() => document.querySelector(".notes-icon-button").click());
    await until(() => run(() => !!document.querySelector(".note-icon-picker")));
    assert(
      await run(() => !document.querySelector(".nomi-tooltip")),
      "Note hint remained over picker",
    );
    await key("Escape");
    await run(() => (location.hash = "/settings/appearance"));
    await until(() =>
      run(() => !!document.querySelector('[data-mode="dark"]')),
    );
    await move('[data-mode="dark"]');
    assert(
      await run(
        () =>
          document.querySelector(".nomi-tooltip span")?.textContent === "Dark",
      ),
      "Appearance hint missing",
    );
    win.setSize(700, 700);
    await wait(120);
    await move('[data-mode="dark"]');
    assert(
      await run(() => {
        const r = document
          .querySelector(".nomi-tooltip")
          .getBoundingClientRect();
        return r.x >= 8 && r.right <= innerWidth - 8;
      }),
      "Narrow hint clipped",
    );
    writeFileSync(
      join(output, "appearance-narrow.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    console.log(
      "Tooltips passed: shared appearance/gap, native hover, focus/keyboard, Escape, shortcuts, menu coexistence, dark and narrow layout.",
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
