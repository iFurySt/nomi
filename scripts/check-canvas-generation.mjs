import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/canvas-generation");
await mkdir(report, { recursive: true });
const output = await mkdtemp(join(report, "run-"));
await build({
  entryPoints: ["scripts/fixtures/canvas-generation.tsx"],
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
  try {
    await win.loadFile(join(output, "index.html"), { hash: "/canvas" });
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await until(() => !!document.querySelector('[aria-label="AI 生成"]'));
    await click("AI 生成");
    await until(
      () =>
        document.querySelector('[aria-label="生成模型"]')?.value ===
        "test-model",
    );
    await prompt("画出输入到输出");
    await shot("composer");
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
      0,
      "IME must not submit",
    );
    await enter();
    await until(
      () => document.querySelectorAll(".generation-object").length === 1,
    );
    assert.equal(
      await js(
        () =>
          document.querySelectorAll(
            ".canvas-generation-layer .canvas-connection-line",
          ).length,
      ),
      0,
    );
    assert.equal(
      await js(
        () => document.querySelectorAll(".canvas-viewport .shape-card").length,
      ),
      0,
      "partial response is not persisted",
    );
    await shot("first-block");
    await until(
      () =>
        document.querySelectorAll(".generation-object").length === 2 &&
        document.querySelectorAll(
          ".canvas-generation-layer .canvas-connection-line",
        ).length === 1,
    );
    await shot("streamed-diagram");
    await until(
      () =>
        !document.querySelector(".canvas-generation-layer") &&
        !!document.querySelector(".canvas-viewport .shape-card"),
    );
    assert.equal(
      await js(
        () => document.querySelectorAll(".canvas-viewport .shape-card").length,
      ),
      2,
    );
    assert.equal(
      await js(() =>
        document
          .querySelector(".canvas-ai-composer")
          .classList.contains("is-docked"),
      ),
      true,
    );
    await shot("completed");
    await click("撤销画布修改");
    await until(() => !document.querySelector(".canvas-viewport .shape-card"));
    await js(() => window.aiFixture.mode("invalid"));
    await prompt("invalid result");
    await enter();
    await until(() => !!document.querySelector(".canvas-ai-error"));
    assert.equal(
      await js(() => !!document.querySelector(".canvas-generation-layer")),
      false,
    );
    assert.equal(
      await js(
        () => document.querySelectorAll(".canvas-viewport .shape-card").length,
      ),
      0,
    );
    await js(() => window.aiFixture.mode("slow"));
    await enter();
    await until(() => !!document.querySelector(".generation-object"));
    await click("停止生成");
    await wait(2100);
    assert.equal(
      await js(() => !!document.querySelector(".canvas-generation-layer")),
      false,
      "late output after stop",
    );
    assert.equal(
      await js(
        () => document.querySelectorAll(".canvas-viewport .shape-card").length,
      ),
      0,
    );
    await enter();
    await until(() => !!document.querySelector('[aria-label="停止生成"]'));
    await click("关闭 AI");
    await wait(2100);
    assert.equal(
      await js(
        () => document.querySelectorAll(".canvas-viewport .shape-card").length,
      ),
      0,
      "late output after close",
    );
    await click("AI 生成");
    await prompt("另一个图示");
    await js(() => (document.documentElement.dataset.theme = "dark"));
    await shot("dark");
    win.setSize(390, 820);
    await until(() => innerWidth === 390);
    await shot("mobile");
    assert.equal(
      await js(() => {
        const r = document
          .querySelector(".canvas-ai-composer")
          .getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth;
      }),
      true,
    );
    console.log(
      "Canvas AI: PASS (IME, streaming blocks/lines, atomic commit/undo, invalid output, stop/close late results, dark/mobile)",
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
