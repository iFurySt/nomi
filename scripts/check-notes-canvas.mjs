import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/notes-canvas");
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

async function checkEmbedded({ output, root }) {
  const { app, BrowserWindow } = require("electron");
  const { writeFileSync, readFileSync, mkdirSync } = require("node:fs");
  const { join, dirname } = require("node:path");
  const { unzipSync } = require(join(root, "packages/ui/node_modules/fflate"));
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
  const run = (fn, data) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(data)})`);
  const assert = (v, m) => {
    if (!v) throw Error(m);
  };
  const until = async (fn, m) => {
    for (let i = 0; i < 180; i++) {
      if (await fn()) return;
      await wait(40);
    }
    throw Error(m);
  };
  const click = (label) =>
    run(
      (label) => document.querySelector(`[aria-label="${label}"]`).click(),
      label,
    );
  const shot = async (name) => {
    await wait(80);
    writeFileSync(
      join(output, name + ".png"),
      (await win.webContents.capturePage()).toPNG(),
    );
  };
  const key = async (keyCode, modifiers = []) => {
    for (const type of ["keyDown", "keyUp"])
      win.webContents.sendInputEvent({ type, keyCode, modifiers });
    await wait(80);
  };
  const bounds = (selector) =>
    run((selector) => {
      const el = document.querySelector(selector);
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, selector);
  const mouse = (type, p, count = 1) =>
    win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type,
      ...p,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: count,
    });
  const nativeClick = async (selector, count = 1) => {
    const r = await bounds(selector),
      p = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    await mouse("mousePressed", p, count);
    await mouse("mouseReleased", p, count);
    await wait(90);
  };
  const drag = async (from, to) => {
    await mouse("mousePressed", from);
    for (let i = 1; i <= 12; i++) {
      await mouse("mouseMoved", {
        x: from.x + ((to.x - from.x) * i) / 12,
        y: from.y + ((to.y - from.y) * i) / 12,
      });
      await wait(10);
    }
    await mouse("mouseReleased", to);
    await wait(100);
  };
  const scene = () =>
    run(async () => {
      const d = await window.canvasFixture.repository("local-device").load();
      return d?.blocks.find((b) => b.type === "canvas")?.scene;
    });
  const close = async () => {
    await click("关闭画布");
    await until(
      () => run(() => !document.querySelector(".embedded-canvas-modal")),
      "Canvas did not close",
    );
  };
  try {
    await win.loadFile(join(output, "index.html"), { hash: "/notes" });
    await until(
      () => run(() => !!document.querySelector('[aria-label="新建文稿"]')),
      "Notes not ready",
    );
    await run(async () => {
      window.originalBoard = JSON.stringify(
        (await window.canvasFixture.repository("local-device").load()).board,
      );
    });
    await click("新建文稿");
    await until(
      () => run(() => !!document.querySelector(".tiptap")?.editor),
      "No editor",
    );
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await run(() => {
      const e = document.querySelector(".tiptap").editor;
      e.commands.setContent("/canvas", { contentType: "markdown" });
      e.commands.focus("end");
    });
    await until(
      () => run(() => !!document.querySelector('[role="option"]')),
      "Slash missing",
    );
    await run(() =>
      [...document.querySelectorAll('[role="option"]')]
        .find((e) => e.textContent.trim() === "画布")
        .click(),
    );
    await until(
      () => run(() => !!document.querySelector("[data-embedded-canvas]")),
      "Canvas insert missing",
    );
    assert(
      await run(
        () =>
          !document.querySelector(".writing-article .canvas-toolbar") &&
          !document
            .querySelector(".writing-article")
            .textContent.includes("/canvas"),
      ),
      "Article should show a preview without drawing controls",
    );
    const initial = await bounds(".embedded-canvas-preview");
    await nativeClick("[data-embedded-canvas]", 2);
    await until(
      () =>
        run(
          () =>
            !!document.querySelector(".embedded-canvas-modal .canvas-toolbar"),
        ),
      "Double click did not open existing Canvas",
    );
    assert(
      await run(
        () =>
          !!document.querySelector('[aria-label="AI 生成"]') &&
          !!document.querySelector('[aria-label="连接工具"]') &&
          !!document.querySelector('[aria-label="对齐吸附"]'),
      ),
      "Existing tools missing",
    );
    assert(
      await run(() => {
        const rail = document
          .querySelector(".canvas-toolbar")
          .getBoundingClientRect();
        const frame = document
          .querySelector(".canvas-workspace")
          .getBoundingClientRect();
        return (
          rail.width < 60 &&
          rail.height > rail.width &&
          rail.left - frame.left < 30 &&
          !document.querySelector(".dialog-header")
        );
      }),
      "Tool rail must be compact, vertical and left aligned",
    );
    await click("模板");
    await until(
      () => run(() => !!document.querySelector(".canvas-template-item")),
      "Templates missing",
    );
    await key("Escape");
    assert(
      await run(
        () =>
          !!document.querySelector(".embedded-canvas-modal") &&
          !document.querySelector(".canvas-tool-menu"),
      ),
      "Escape on template must not exit canvas",
    );
    assert(
      await run(() => {
        const hidden = document
          .querySelector(".embedded-canvas-modal > header")
          .getBoundingClientRect();
        const status = document
          .querySelector(".canvas-save-status")
          .getBoundingClientRect();
        return hidden.width <= 1 && status.width <= 1;
      }),
      "Screen-reader text must not leak into canvas",
    );
    const addShape = async (type) => {
      await click("添加形状");
      await until(
        () => run(() => !!document.querySelector(".canvas-tool-menu")),
        "Shapes missing",
      );
      if (type === "rectangle") await shot("shapes-menu");
      await run(
        (type) =>
          document.querySelector(`[data-create-shape="${type}"]`).click(),
        type,
      );
      await until(
        () => run(() => !!document.querySelector("[data-shape-text]")),
        "Shape editor missing",
      );
    };
    await addShape("rectangle");
    await win.webContents.insertText("开始");
    await nativeClick(".canvas-titlebar");
    const first = await bounds(".embedded-canvas-modal .shape-card");
    await drag(
      { x: first.x + first.width / 2, y: first.y + first.height / 2 },
      {
        x: first.x + first.width / 2 - 240,
        y: first.y + first.height / 2 - 60,
      },
    );
    await addShape("ellipse");
    await win.webContents.insertText("结果");
    await nativeClick(".canvas-titlebar");
    const second = await bounds(
      ".embedded-canvas-modal .shape-card:last-of-type",
    );
    await drag(
      { x: second.x + second.width / 2, y: second.y + second.height / 2 },
      {
        x: second.x + second.width / 2 + 200,
        y: second.y + second.height / 2 + 80,
      },
    );
    // Reuse the editor's native bound-connection gesture.
    await click("连接工具");
    const ports = await run(() => {
      const cards = [
        ...document.querySelectorAll(".embedded-canvas-modal .shape-card"),
      ];
      return cards.map((c, i) => {
        const r = c
          .querySelector(`[data-port="${i ? "w" : "e"}"]`)
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    });
    await drag(ports[0], ports[1]);
    await until(
      async () => ((await scene())?.board.connectors?.length ?? 0) === 1,
      "Bound connector not saved",
    );
    await shot("editor");
    await close();
    await until(
      () =>
        run(
          () =>
            document.querySelectorAll("[data-preview-placement]").length === 2,
        ),
      "Preview did not render scene",
    );
    const preview = await bounds(".embedded-canvas-preview");
    assert(
      preview.height !== initial.height && preview.height < 640,
      "Preview did not fit content",
    );
    assert(
      await run(() =>
        [...document.querySelectorAll("[data-preview-placement]")].every(
          (e) => {
            const a = e.getBoundingClientRect(),
              r = document
                .querySelector(".embedded-canvas-preview")
                .getBoundingClientRect();
            return (
              a.left >= r.left &&
              a.right <= r.right + 1 &&
              a.top >= r.top &&
              a.bottom <= r.bottom + 1
            );
          },
        ),
      ),
      "Preview clipped objects",
    );
    await shot("preview-light");
    // A second block uses the same Canvas implementation with an independent scene.
    const plus = await run(() => {
      const frame = [...document.querySelectorAll(".writing-rich-frame")].at(
        -1,
      );
      frame.querySelector(".tiptap").editor.commands.focus();
      const button = frame.querySelector('[aria-haspopup="menu"]');
      button.scrollIntoView({ block: "center" });
      const r = button.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await mouse("mouseMoved", plus);
    await mouse("mousePressed", plus);
    await mouse("mouseReleased", plus);
    await until(
      () =>
        run(
          () =>
            !![...document.querySelectorAll('[role="menuitem"]')].find(
              (e) => e.textContent.trim() === "画布",
            ),
        ),
      "Plus canvas choice missing",
    );
    await run(() =>
      [...document.querySelectorAll('[role="menuitem"]')]
        .find((e) => e.textContent.trim() === "画布")
        .click(),
    );
    await until(
      () =>
        run(
          () =>
            document.querySelectorAll("[data-embedded-canvas]").length === 2,
        ),
      "Second canvas insertion failed",
    );
    await key("Z", ["meta"]);
    await until(
      () =>
        run(
          () =>
            document.querySelectorAll("[data-embedded-canvas]").length === 1,
        ),
      "Insert undo failed",
    );
    assert(
      await run(
        () =>
          document.querySelectorAll("[data-preview-placement]").length === 2,
      ),
      "Inserting/removing another canvas changed the first",
    );
    // Reopen without writing: camera and selection must not mutate scene content.
    const before = JSON.stringify(await scene());
    await nativeClick("[data-embedded-canvas]", 2);
    await until(
      () =>
        run(
          () =>
            !!document.querySelector(".embedded-canvas-modal .canvas-toolbar"),
        ),
      "Reopen failed",
    );
    await click("适应画布内容");
    await close();
    assert(
      JSON.stringify(await scene()) === before,
      "Opening/fitting rewrote content",
    );
    // Existing Canvas keyboard history must work inside the dialog, independently of Notes focus.
    await nativeClick("[data-embedded-canvas]", 2);
    await until(
      () =>
        run(
          () =>
            !!document.querySelector(".embedded-canvas-modal .canvas-toolbar"),
        ),
      "Reopen failed",
    );
    await click("撤销画布修改");
    await until(
      async () => ((await scene())?.board.connectors?.length ?? 0) === 0,
      "Undo did not restore scene",
    );
    await key("Z", ["meta", "shift"]);
    await until(
      async () => ((await scene())?.board.connectors?.length ?? 0) === 1,
      "Redo failed",
    );
    await close();
    await nativeClick("[data-embedded-canvas]", 2);
    await until(
      () => run(() => !!document.querySelector('[aria-label="画布名称"]')),
      "Name missing",
    );
    await nativeClick('[aria-label="画布名称"]');
    await key("A", ["meta"]);
    await win.webContents.insertText("学习流程");
    await key("Return");
    await until(
      async () => (await scene())?.title === "学习流程",
      "Rename not saved",
    );
    await key("Escape");
    await until(
      () => run(() => !document.querySelector(".embedded-canvas-modal")),
      "Escape must return to document",
    );
    await nativeClick("[data-embedded-canvas]", 2);
    await until(
      () =>
        run(
          () =>
            document.querySelector('[aria-label="画布名称"]')?.value ===
            "学习流程",
        ),
      "Reopen lost name",
    );
    await close();
    await run(() => (document.documentElement.dataset.theme = "dark"));
    await shot("preview-dark");
    win.setSize(420, 900);
    await wait(120);
    assert(
      await run(() => document.documentElement.scrollWidth === innerWidth),
      "Narrow overflow",
    );
    await shot("preview-narrow");
    await nativeClick("[data-embedded-canvas]", 2);
    await until(
      () =>
        run(
          () =>
            !!document.querySelector(".embedded-canvas-modal .canvas-toolbar"),
        ),
      "Narrow editor failed",
    );
    await shot("editor-narrow");
    await close();
    await until(
      () => run(() => !!document.querySelector('[data-save-state="saved"]')),
      "Save pending",
    );
    assert(
      await run(
        async () =>
          JSON.stringify(
            (await window.canvasFixture.repository("local-device").load())
              .board,
          ) === window.originalBoard,
      ),
      "Embedded edits changed global board",
    );
    win.webContents.debugger.detach();
    await new Promise((r) => {
      win.webContents.once("did-finish-load", r);
      win.reload();
    });
    await until(
      () =>
        run(
          () =>
            document.querySelectorAll("[data-preview-placement]").length === 2,
        ),
      "Reload lost preview",
    );
    win.setSize(1300, 950);
    await wait(120);
    const noteId = await run(
      () =>
        document.querySelector('[data-note-row][aria-selected="true"]').dataset
          .noteRow,
    );
    let downloaded = false;
    win.webContents.session.once("will-download", (_e, item) => {
      item.setSavePath(join(output, "canvas.zip"));
      item.once("done", (_e, state) => (downloaded = state === "completed"));
    });
    await run((id) => window.canvasFixture.archiveNote(id), noteId);
    await until(() => downloaded, "No archive");
    const files = unzipSync(readFileSync(join(output, "canvas.zip")));
    for (const [path, bytes] of Object.entries(files)) {
      const target = join(output, "export", path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    await win.loadFile(
      join(output, "export/assets/nomi/transformer/index.html"),
    );
    await until(
      () =>
        run(
          () =>
            document.querySelectorAll("[data-preview-placement]").length ===
              2 && document.body.textContent.includes("开始"),
        ),
      "Offline preview missing",
    );
    await shot("offline");
    writeFileSync(
      join(output, "report.json"),
      JSON.stringify(
        {
          insert: true,
          doubleClick: true,
          existingCanvas: true,
          shapes: true,
          text: true,
          boundConnector: true,
          autoFit: true,
          undoRedo: true,
          viewDoesNotWrite: true,
          isolatedGlobalBoard: true,
          narrow: true,
          reload: true,
          offline: true,
        },
        null,
        2,
      ),
    );
    console.log(
      "Embedded Canvas passed: shared editor, native shapes/connection, auto-fit preview, history, isolation, reopen, narrow and offline.",
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    await shot("failure");
    app.exit(1);
  }
}
await writeFile(
  join(output, "main.cjs"),
  `(${checkEmbedded})(${JSON.stringify({ output, root })});setTimeout(()=>require('electron').app.exit(1),90000);`,
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
