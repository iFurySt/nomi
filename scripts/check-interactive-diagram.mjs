import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/interactive-diagram");
await mkdir(report, { recursive: true });
const output = await mkdtemp(join(report, "run-"));
await build({
  entryPoints: ["scripts/fixtures/interactive-v2.tsx"],
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
  const fs = require("node:fs"),
    path = require("node:path"),
    assert = require("node:assert/strict");
  app.setPath("userData", path.join(output, "profile"));
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1000,
    height: 1050,
    show: false,
    webPreferences: { backgroundThrottling: false },
  });
  const js = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg)})`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn) => {
    for (let i = 0; i < 160; i++) {
      if (await js(fn)) return;
      await wait(30);
    }
    throw Error("Timeout " + fn);
  };
  const shot = async (name) => {
    await wait(120);
    fs.writeFileSync(
      path.join(output, name + ".png"),
      (await win.webContents.capturePage()).toPNG(),
    );
  };
  try {
    await win.loadFile(path.join(output, "index.html"));
    for (const name of ["diagram", "generatedDiagram"]) {
      win.setSize(1000, 1050);
      await js(() => (document.documentElement.dataset.theme = "light"));
      await js((name) => window.labFixture.show(name), name);
      await until(
        () => document.querySelectorAll("[data-diagram-node]").length === 5,
      );
      await until(
        () =>
          document.querySelectorAll(".interactive-diagram-edges > path")
            .length === 5,
      );
      assert.equal(
        await js(() => document.querySelectorAll("table").length),
        0,
      );
      await shot(name + "-light");
      const enter = async (value) => {
        await js((value) => {
          const e = document.querySelector(
            ".interactive-diagram .learning-input input",
          );
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          ).set.call(e, value);
          e.dispatchEvent(new Event("input", { bubbles: true }));
          e.focus();
        }, value);
        await wait(150);
      };
      await enter("ab ab ac");
      assert.match(
        await js(
          () => document.querySelector('[data-node="rules"]').textContent,
        ),
        /a \+ b → ab/,
      );
      assert.match(
        await js(
          () => document.querySelector('[data-node="vocabulary"]').textContent,
        ),
        /ab▁/,
      );
      await enter("");
      assert.equal(
        await js(
          () =>
            document.querySelectorAll('[data-node="rules"] .lesson-token')
              .length,
        ),
        0,
      );
      await enter("we learn learning and we learned");
      win.setSize(420, 1050);
      await js(() => (document.documentElement.dataset.theme = "dark"));
      await until(() => innerWidth === 420);
      await wait(150);
      assert.equal(
        await js(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        "no document overflow",
      );
      assert.equal(
        await js(() =>
          [
            ...document.querySelectorAll(".interactive-diagram-edges > path"),
          ].every((p) => !p.getAttribute("d").includes("NaN")),
        ),
        true,
      );
      assert.equal(
        await js(() =>
          [...document.querySelectorAll("[data-diagram-node]")].every(
            (n) => n.getBoundingClientRect().height <= 301,
          ),
        ),
        true,
        "long nodes scroll within the graph",
      );
      await shot(name + "-dark-narrow");
    }
    console.log(
      "Diagram PASS: five nodes/five edges, no tables, sentence recomputes real vocabulary/rules, empty input, responsive edge geometry, dark/narrow",
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
