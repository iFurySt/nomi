import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/interactive-v2");
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
  const fs = require("node:fs");
  const path = require("node:path");
  const assert = require("node:assert/strict");
  app.disableHardwareAcceleration();
  app.setPath("userData", path.join(output, "profile"));
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1020,
    height: 1000,
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
    for (let i = 0; i < 100; i++) {
      if (await js(fn)) return;
      await wait(30);
    }
    throw Error("Timed out " + fn);
  };
  const shot = async (name) => {
    await wait(100);
    fs.writeFileSync(
      path.join(output, name + ".png"),
      (await win.webContents.capturePage()).toPNG(),
    );
  };
  try {
    await win.loadFile(path.join(output, "index.html"));
    await until(() => !!document.querySelector("textarea"));
    await js(() => {
      const e = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(e, "ab ab ac");
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.focus();
    });
    await wait(80);
    await js(() =>
      [...document.querySelectorAll("button")]
        .find((e) => e.textContent === "下一步")
        .click(),
    );
    await until(
      () =>
        document.querySelector('[data-node="after"] strong')?.textContent ===
        "7",
    );
    await shot("bpe-step-one");
    await js(() =>
      [...document.querySelectorAll("button")]
        .find((e) => e.textContent === "下一步")
        .click(),
    );
    await until(
      () =>
        document.querySelector('[data-node="after"] strong')?.textContent ===
        "5",
    );
    await win.reload();
    await until(
      () =>
        document.querySelector('[data-node="after"] strong')?.textContent ===
        "5",
    );
    await js(() => {
      const e = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(e, "</w>");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await until(() => !!document.querySelector(".learning-alert"));
    assert.ok(
      await js(() => !!document.querySelector("textarea")),
      "Invalid computation keeps inputs editable",
    );
    await js(() => {
      const e = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(e, "ab ab ac");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await js(() =>
      [...document.querySelectorAll("button")]
        .find((e) => e.textContent === "从头开始")
        .click(),
    );
    await until(() => !document.querySelector(".learning-alert"));
    await js(() => window.labFixture.show("wave"));
    await until(() => !!document.querySelector(".learning-plot"));
    const before = await js(() =>
      document.querySelector(".learning-plot path")?.getAttribute("d"),
    );
    await js(() => {
      const e = document.querySelector("input[type=range]");
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(e, "0");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(80);
    assert.notEqual(
      await js(() =>
        document.querySelector(".learning-plot path")?.getAttribute("d"),
      ),
      before,
    );
    await shot("wave-zero");
    await js(() =>
      [...document.querySelectorAll("button")]
        .find((e) => e.textContent?.includes("重置"))
        .click(),
    );
    await shot("wave");
    win.setSize(390, 860);
    await wait(150);
    await shot("wave-mobile");
    assert.ok(
      await js(() => document.documentElement.scrollWidth <= innerWidth),
      "No viewport overflow at 390px",
    );
    await js(() => (document.documentElement.dataset.theme = "dark"));
    await shot("wave-dark");
    await js(() => window.labFixture.show("bpe"));
    await until(() => !!document.querySelector("textarea"));
    await shot("bpe-mobile-dark");
    assert.ok(
      await js(() => document.documentElement.scrollWidth <= innerWidth),
      "No BPE viewport overflow",
    );
    await js(() => window.labFixture.show("generatedWave"));
    await until(() => !!document.querySelector(".learning-scene circle"));
    const ballBefore = await js(() =>
      document.querySelector(".learning-scene circle").getAttribute("cy"),
    );
    await js(() => {
      const e = document.querySelectorAll("input[type=range]")[1];
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(e, "1.9");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await until(
      () =>
        document.querySelector(".learning-metric strong")?.textContent ===
        "-0.588",
    );
    assert.notEqual(
      await js(() =>
        document.querySelector(".learning-scene circle").getAttribute("cy"),
      ),
      ballBefore,
    );
    await shot("generated-wave-mobile-dark");
    await js(() => (document.documentElement.dataset.theme = "light"));
    win.setSize(1020, 1300);
    await wait(150);
    await shot("generated-wave");
    await js(() =>
      [...document.querySelectorAll("button")]
        .find((e) => e.textContent === "重置")
        .click(),
    );
    await until(
      () =>
        document.querySelector(".learning-metric strong")?.textContent ===
        "0.000",
    );
    await js(() => window.labFixture.show("generatedBpe"));
    await until(() => !!document.querySelector("textarea"));
    await shot("generated-bpe");
    await js(() => window.labFixture.show("generatedSentence"));
    await until(() =>
      document.querySelector("textarea")?.value.startsWith("we learn"),
    );
    await js(() =>
      [...document.querySelectorAll("button")]
        .find((e) => e.textContent === "合并一次")
        .click(),
    );
    await until(
      () =>
        document.querySelector('[data-node="current"] strong')?.textContent ===
        "36",
    );
    await shot("generated-bpe-sentence");
    assert.ok(
      await js(() => {
        const panels = document.querySelector('[data-node="process"]').children;
        return (
          Math.abs(
            panels[0].getBoundingClientRect().top -
              panels[1].getBoundingClientRect().top,
          ) < 2
        );
      }),
      "Parallel process panels align at their top",
    );
    win.setSize(390, 1000);
    await wait(150);
    await shot("generated-bpe-sentence-mobile");
    assert.ok(
      await js(() => document.documentElement.scrollWidth <= innerWidth),
      "Generated sentence lab fits narrow screens",
    );
    await js(() => window.labFixture.show("compact"));
    win.setSize(900, 950);
    await until(() => !!document.querySelector(".learning-token"));
    await shot("compact-initial");
    assert.equal(
      await js(() => document.querySelector('[data-node="prev"]').disabled),
      true,
    );
    assert.equal(
      await js(
        () =>
          document.querySelector('[data-node="pairs"] tbody').children.length,
      ),
      6,
    );
    await js(() => document.querySelector('[data-node="next"]').click());
    await until(() =>
      document
        .querySelector('[data-node="metrics"]')
        .textContent.includes("36"),
    );
    assert.ok(
      await js(
        () =>
          document.querySelectorAll(".learning-token[data-emphasis]").length >
          0,
      ),
    );
    assert.equal(
      await js(() =>
        document.querySelector('[data-node="merges"] tr[data-emphasis]'),
      ),
      null,
    );
    assert.equal(
      await js(
        () =>
          document.querySelectorAll(
            '[data-node="merges"] .learning-token[data-emphasis]',
          ).length,
      ),
      1,
    );
    assert.equal(
      await js(
        () =>
          document.querySelector('[data-node="merges"] .learning-tokens')
            .textContent,
      ),
      "a+r→ar",
    );
    assert.equal(
      await js(
        () =>
          document.querySelector('[data-node="pairs"] tbody tr').textContent,
      ),
      "ar+n3←",
    );
    assert.ok(
      await js(
        () => document.querySelectorAll(".learning-token-group").length > 0,
      ),
    );
    await shot("compact-step-one");
    await js(() =>
      document
        .querySelector('[data-node="pairs"] .learning-table-expand')
        .click(),
    );
    await until(
      () =>
        document.querySelector('[data-node="pairs"] tbody').children.length > 6,
    );
    await js(() =>
      document
        .querySelector('[data-node="pairs"] .learning-table-expand')
        .click(),
    );
    await js(() => {
      const e = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(e, "ab ab ac");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await until(() =>
      document
        .querySelector('[data-node="roundLabel"]')
        .textContent.includes("第 0"),
    );
    for (let i = 0; i < 4; i++) {
      await js(() => document.querySelector('[data-node="next"]').click());
      await wait(40);
    }
    assert.equal(
      await js(() => document.querySelector('[data-node="next"]').disabled),
      true,
    );
    await shot("compact-completed");
    await js(() => document.querySelector('[data-node="reset"]').click());
    await until(
      () =>
        document.querySelector('[data-node="metrics"]').textContent ===
        "词元 9",
    );
    await js(() => {
      const e = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(e, "");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await until(() => document.querySelector('[data-node="next"]').disabled);
    await js(() => {
      const e = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(e, "we learn to learn and we love learning");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    win.setSize(390, 1000);
    await wait(120);
    assert.ok(
      await js(() => document.documentElement.scrollWidth <= innerWidth),
    );
    await shot("compact-mobile");
    await js(() => (document.documentElement.dataset.theme = "dark"));
    await shot("compact-mobile-dark");
    win.setSize(900, 950);
    await wait(120);
    await shot("compact-dark");
    // DSL draft validation and cancel/apply must not mutate the running block early.
    await js(() => document.querySelector('[aria-label="编辑 DSL"]').click());
    await until(() => !!document.querySelector('[aria-label="交互块 DSL"]'));
    const original = await js(
      () => document.querySelector('[aria-label="交互块 DSL"]').value,
    );
    const editDSL = async (source) =>
      js((text) => {
        const input = document.querySelector('[aria-label="交互块 DSL"]');
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        ).set.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, source);
    const dialogButton = async (label) =>
      js(
        (label) =>
          [...document.querySelectorAll('[role="dialog"] button')]
            .find((b) => b.textContent === label)
            .click(),
        label,
      );
    await editDSL("{invalid");
    await dialogButton("应用");
    await until(
      () => !!document.querySelector('[role="dialog"] [role="alert"]'),
    );
    assert.equal(
      await js(
        () =>
          document.querySelectorAll(".canvas-interactive .interactive-surface")
            .length > 0,
      ),
      true,
    );
    await dialogButton("取消");
    await js(() => document.querySelector('[aria-label="编辑 DSL"]').click());
    await until(() => !!document.querySelector('[aria-label="交互块 DSL"]'));
    assert.equal(
      await js(() => document.querySelector('[aria-label="交互块 DSL"]').value),
      original,
    );
    const updated = JSON.parse(original);
    updated.id = "edited-dsl";
    await editDSL(JSON.stringify(updated, null, 2));
    await dialogButton("应用");
    await until(() => !document.querySelector('[role="dialog"]'));
    await js(() => document.querySelector('[aria-label="编辑 DSL"]').click());
    await until(() => !!document.querySelector('[aria-label="交互块 DSL"]'));
    assert.equal(
      await js(
        () =>
          JSON.parse(document.querySelector('[aria-label="交互块 DSL"]').value)
            .id,
      ),
      "edited-dsl",
    );
    await shot("dsl-edit");
    await dialogButton("取消");
    console.log(
      "Interactive v2 PASS: recompute, step, reset, persistence, error recovery, wave, 390px, dark, DSL validate/cancel/apply",
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
