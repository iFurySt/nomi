import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/outline");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-"));
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/outline.tsx"],
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
    webPreferences: { backgroundThrottling: false },
  });
  const run = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg)})`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const assert = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const until = async (fn) => {
    for (let i = 0; i < 100; i++) {
      if (await fn()) return;
      await wait(30);
    }
    throw Error("Outline condition timed out");
  };
  const shot = async (name) =>
    writeFileSync(
      join(output, name + ".png"),
      (await win.webContents.capturePage()).toPNG(),
    );
  const move = async (x, y) => {
    await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      buttons: 0,
    });
    await wait(50);
  };
  const geom = () =>
    run(() => {
      const r = document.querySelector(".tiptap").getBoundingClientRect();
      const pane = document.querySelector(".notes-scroll");
      const p = pane.getBoundingClientRect();
      return {
        left: r.left,
        width: r.width,
        right: r.right,
        // Classic scrollbars occupy layout space on CI; compare the usable viewport.
        paneLeft: p.left + pane.clientLeft,
        paneRight: p.left + pane.clientLeft + pane.clientWidth,
      };
    });
  try {
    await win.loadFile(join(output, "index.html"));
    await until(() => run(() => !!document.querySelector(".writing-outline")));
    // Exercise the non-overlay scrollbar geometry even on a trackpad-equipped Mac.
    await win.webContents.insertCSS(
      ".notes-scroll::-webkit-scrollbar { width: 15px; }",
    );
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    const original = await geom();
    assert(
      Math.abs(
        original.left -
          original.paneLeft -
          (original.paneRight - original.right),
      ) < 1,
      "Body margins are asymmetric: " + JSON.stringify(original),
    );
    await move(20, 116);
    await until(() =>
      run(() => !!document.querySelector('[aria-label="固定目录"]')),
    );
    await run(() => document.querySelector('[aria-label="固定目录"]').click());
    await until(() =>
      run(() => !!document.querySelector(".writing-outline[data-pinned]")),
    );
    assert(
      JSON.stringify(await geom()) === JSON.stringify(original),
      "Pinning shifted the body",
    );
    assert(
      await run(() => {
        const outline = document.querySelector(".writing-outline");
        const text = document.querySelector(".tiptap").getBoundingClientRect();
        return (
          outline.getBoundingClientRect().right <= text.left - 50 &&
          outline
            .querySelector("header svg.lucide-pin")
            .getAttribute("fill") === "currentColor"
        );
      }),
      "Pinned outline overlaps writing controls or has wrong pin icon",
    );
    await move(600, 20);
    assert(
      await run(
        () =>
          getComputedStyle(
            document.querySelector(".writing-outline header button"),
          ).opacity === "0",
      ),
      "Pin icon visible without hover",
    );
    assert(
      await run(
        () =>
          getComputedStyle(
            document.querySelector(".writing-outline button[aria-current]"),
          ).backgroundColor === "rgba(0, 0, 0, 0)",
      ),
      "Active chapter has background",
    );
    await shot("pinned-light");
    await move(60, 100);
    assert(
      await run(
        () =>
          getComputedStyle(
            document.querySelector(".writing-outline header button"),
          ).opacity === "1",
      ),
      "Pin unavailable on hover",
    );
    await shot("pinned-hover");
    await run(() =>
      document
        .querySelectorAll('.writing-outline [role="navigation"] button')[2]
        .click(),
    );
    await until(() =>
      run(
        () =>
          document
            .querySelectorAll('.writing-outline [role="navigation"] button')[2]
            .getAttribute("aria-current") === "location",
      ),
    );
    await run(() => (document.documentElement.dataset.theme = "dark"));
    await move(600, 20);
    await shot("pinned-dark");
    win.setSize(820, 900);
    await wait(100);
    await until(() =>
      run(() => !document.querySelector(".writing-outline[data-pinned]")),
    );
    let narrow = await geom();
    assert(
      Math.abs(
        narrow.left - narrow.paneLeft - (narrow.paneRight - narrow.right),
      ) < 1,
      "Compact outline shifts text",
    );
    await shot("compact");
    win.setSize(390, 900);
    await wait(100);
    narrow = await geom();
    assert(
      Math.abs(
        narrow.left - narrow.paneLeft - (narrow.paneRight - narrow.right),
      ) < 1,
      "Mobile margins asymmetric",
    );
    assert(
      await run(() => document.documentElement.scrollWidth === innerWidth),
      "Mobile overflow",
    );
    await shot("mobile");
    win.setSize(1200, 900);
    await wait(100);
    await until(() =>
      run(() => !!document.querySelector(".writing-outline[data-pinned]")),
    );
    await run(() =>
      document.querySelector('[aria-label="取消固定目录"]').click(),
    );
    await move(600, 20);
    assert(
      JSON.stringify(await geom()) === JSON.stringify(original),
      "Unpinning shifted body",
    );
    console.log(
      "Outline passed: equal margins, pin/unpin geometry, filled hover-only pin, chapter tracking, dark, compact and mobile.",
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
