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
      e.commands.setContent("/nomatchxyz", { contentType: "markdown" });
      e.commands.focus("end");
    });
    await until(
      () => run(() => !!document.querySelector(".writing-slash-empty svg")),
      "Missing compact empty state",
    );
    assert(
      await run(
        () =>
          !document.querySelector(".writing-slash-footer") &&
          getComputedStyle(
            document.querySelector(".writing-slash-empty .sr-only"),
          ).position === "absolute",
      ),
      "Empty menu leaked instructions",
    );
    await shot("slash-empty");
    for (const query of ["canvas", "画板", "huabu", "HUABAN", "huaban"]) {
      await run((query) => {
        const e = document.querySelector(".tiptap").editor;
        e.commands.setContent("/" + query, { contentType: "markdown" });
        e.commands.focus("end");
      }, query);
      await until(
        () =>
          run(() =>
            [...document.querySelectorAll('[role="option"]')].some(
              (e) => e.textContent.trim() === "画布",
            ),
          ),
        "Canvas alias missing: " + query,
      );
    }
    assert(
      await run(
        () =>
          !document.querySelector(".writing-slash-footer") &&
          !document.querySelector(".writing-slash-group"),
      ),
      "Filtered slash menu must stay compact",
    );
    await shot("slash-huaban");
    await key("Return");
    await until(
      () =>
        run(
          () =>
            !!document.querySelector(".embedded-canvas-modal .canvas-viewport"),
        ),
      "Enter must insert and open canvas directly",
    );
    assert(
      await run(() => document.activeElement?.matches(".canvas-viewport")),
      "Inserted canvas must receive editing focus",
    );
    await key("Escape");
    await until(
      () => run(() => !document.querySelector(".embedded-canvas-modal")),
      "New canvas must close with Escape",
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
    assert(
      await run(
        () =>
          !document.querySelector(".embedded-canvas-hint") &&
          !document
            .querySelector("[data-embedded-canvas]")
            .hasAttribute("title") &&
          [
            ...document.querySelectorAll(".writing-article [data-placeholder]"),
          ].every((el) => !el.dataset.placeholder),
      ),
      "Article must not show canvas hints or writing placeholders",
    );
    assert(
      await run(
        () =>
          document.querySelector(".embedded-canvas-empty")?.textContent ===
            "暂无内容" && !document.querySelector(".embedded-canvas-empty svg"),
      ),
      "Empty canvas must use short empty state",
    );
    const emptyBox = await bounds("[data-embedded-canvas]");
    await mouse("mouseMoved", { x: emptyBox.x + 40, y: emptyBox.y + 30 });
    await shot("empty-hover");
    const assertFullCanvas = async () => {
      assert(
        await run(() => {
          const el = document.querySelector(".embedded-canvas-modal");
          const r = el.getBoundingClientRect();
          const css = getComputedStyle(el);
          return (
            Math.abs(r.x) < 1 &&
            Math.abs(r.y) < 1 &&
            Math.abs(r.width - innerWidth) < 1 &&
            Math.abs(r.height - innerHeight) < 1 &&
            css.borderTopWidth === "0px" &&
            css.borderRadius === "0px"
          );
        }),
        "Embedded canvas must fill the viewport without margins or borders",
      );
    };
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
          !!document.querySelector('[aria-label="文本工具"]'),
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
    await assertFullCanvas();
    const canvasRoute = await run(() => location.hash);
    assert(
      canvasRoute.includes("&canvas="),
      "Opening canvas must add a navigation entry",
    );
    await run(() =>
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "[",
          metaKey: true,
          bubbles: true,
        }),
      ),
    );
    await until(
      () => run(() => !document.querySelector(".embedded-canvas-modal")),
      "Command+[ did not return to Notes",
    );
    assert(
      await run(
        () =>
          location.hash.startsWith("#/notes?note=") &&
          !location.hash.includes("canvas="),
      ),
      "Back left the owning note",
    );
    await run(() =>
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "]",
          metaKey: true,
          bubbles: true,
        }),
      ),
    );
    await until(
      () =>
        run(
          () =>
            !!document.querySelector(".embedded-canvas-modal .canvas-viewport"),
        ),
      "Command+] did not reopen canvas",
    );
    assert(
      (await run(() => location.hash)) === canvasRoute,
      "Forward changed the canvas route",
    );
    assert(
      await run(() => {
        const drag = document.querySelector(".embedded-canvas-window-drag");
        const rect = drag.getBoundingClientRect();
        const close = document
          .querySelector('[aria-label="关闭画布"]')
          .getBoundingClientRect();
        return (
          getComputedStyle(drag).getPropertyValue("-webkit-app-region") ===
            "drag" &&
          rect.top === 0 &&
          rect.width === innerWidth &&
          rect.height === 44 &&
          document.elementFromPoint(innerWidth / 2, 20) === drag &&
          close.top >= rect.bottom &&
          getComputedStyle(document.querySelector(".embedded-canvas-modal"))
            .webkitAppRegion === "drag" &&
          getComputedStyle(document.querySelector(".embedded-canvas-overlay"))
            .webkitAppRegion === "drag" &&
          document
            .querySelector(".embedded-canvas-modal > .canvas-workspace")
            .getBoundingClientRect().top >= rect.bottom
        );
      }),
      "Native window drag strip must cover only the top safe area",
    );

    assert(
      await run(() => document.activeElement?.matches(".canvas-viewport")),
      "Opening canvas must focus its surface, not Close",
    );
    await shot("initial-canvas-focus");

    // Keyboard focus stays visible through fill, without the heavy black ring.
    await key("Tab");
    await run(() => document.querySelector('[aria-label="关闭画布"]').focus());
    assert(
      await run(() => {
        const el = document.activeElement,
          css = getComputedStyle(el);
        return (
          el.matches(":focus-visible") &&
          css.outlineStyle === "none" &&
          css.boxShadow === "none"
        );
      }),
      "Close focus must not draw a black frame",
    );
    await nativeClick('[aria-label="模板"]');
    await until(
      () => run(() => !!document.querySelector(".canvas-template-item")),
      "Templates missing",
    );
    await run(() => document.querySelector(".canvas-template-item").focus());
    assert(
      await run(
        () => getComputedStyle(document.activeElement).outlineStyle === "none",
      ),
      "Menu focus must not draw a black frame",
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
    assert(
      await run(() => {
        const bar = document
          .querySelector(".canvas-toolbar")
          .getBoundingClientRect();
        const view = document
          .querySelector(".canvas-viewport")
          .getBoundingClientRect();
        const header = document
          .querySelector(".canvas-titlebar")
          .getBoundingClientRect();
        return (
          Math.abs((bar.top + bar.bottom) / 2 - (view.top + view.bottom) / 2) <
            2 &&
          header.top >= 48 &&
          document.querySelectorAll(".canvas-toolbar .canvas-tool-divider")
            .length === 3 &&
          !document.querySelector(".canvas-toolbar [aria-label='撤销画布修改']")
        );
      }),
      "Tool rail must be centered and header clear of traffic lights",
    );
    const view = await bounds(".canvas-viewport");
    const shapeButton = await bounds('[aria-label="添加形状"]');
    await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: shapeButton.x + 16,
      y: shapeButton.y + 16,
    });
    await until(
      () => run(() => !!document.querySelector(".canvas-tool-menu")),
      "Shape hover failed",
    );
    await shot("shapes-hover");
    await mouse("mouseMoved", { x: view.width - 30, y: view.height - 30 });
    await wait(250);
    const textButton = await bounds('[aria-label="文本工具"]');
    await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: textButton.x + 16,
      y: textButton.y + 16,
    });
    await until(
      () =>
        run(
          () =>
            document.querySelector('[role="tooltip"]')?.textContent ===
            "Text (T)",
        ),
      "Text tooltip/shortcut missing",
    );
    await shot("text-tooltip");
    await mouse("mouseMoved", { x: view.width - 30, y: view.height - 30 });
    await wait(250);
    await run(() => document.querySelector(".canvas-viewport").focus());
    await key("r");
    await mouse("mousePressed", { x: 500, y: 350 });
    await mouse("mouseMoved", { x: 700, y: 470 });
    await key("Escape");
    await mouse("mouseReleased", { x: 700, y: 470 });
    assert(
      await run(
        () =>
          !!document.querySelector(".embedded-canvas-modal") &&
          !document.querySelector(".canvas-draw-preview") &&
          !document.querySelector(".embedded-canvas-modal .shape-card"),
      ),
      "Escape must cancel drawing without exiting canvas",
    );
    await key("t");
    await mouse("mousePressed", { x: 500, y: 350 });
    await mouse("mouseReleased", { x: 500, y: 350 });
    await until(
      () => run(() => !!document.querySelector("[data-shape-text]")),
      "T must insert editable text on click",
    );
    await nativeClick(".canvas-titlebar");
    await click("撤销画布修改");
    await until(
      () =>
        run(
          () => !document.querySelector(".embedded-canvas-modal .shape-card"),
        ),
      "Text insertion undo failed",
    );
    for (const mode of ["line", "arrow", "rounded", "curve"]) {
      await click("连接工具");
      await until(
        () => run(() => !!document.querySelector(".canvas-line-menu")),
        "Line menu missing",
      );
      if (mode === "line") await shot("line-menu");
      await run(
        (mode) => document.querySelector(`[data-line-mode="${mode}"]`).click(),
        mode,
      );
      await drag({ x: 450, y: 550 }, { x: 750, y: 650 });
      await until(
        async () => (await scene())?.board.connectors?.length === 1,
        "Line draw failed",
      );
      const connector = (await scene()).board.connectors[0];
      assert(
        connector.routing ===
          (["line", "arrow"].includes(mode) ? "straight" : mode) &&
          connector.endArrow === (mode !== "line"),
        "Wrong line mode",
      );
      await click("撤销画布修改");
      await until(
        async () => !(await scene())?.board.connectors?.length,
        "Line undo failed",
      );
    }
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
      const count = await run(
        () =>
          document.querySelectorAll(".embedded-canvas-modal .shape-card")
            .length,
      );
      const v = await bounds(".canvas-viewport");
      // Reverse drag also checks normalization; selecting a tool alone adds nothing.
      const from = { x: v.x + v.width / 2 + 100, y: v.y + v.height / 2 + 60 };
      const to = { x: from.x - 200, y: from.y - 120 };
      await mouse("mousePressed", from);
      await mouse("mouseMoved", to);
      await wait(90);
      assert(
        await run(
          (count) =>
            document.querySelectorAll(".embedded-canvas-modal .shape-card")
              .length === count &&
            !!document.querySelector(".canvas-draw-preview"),
          count,
        ),
        "Drawing must preview without inserting",
      );
      await mouse("mouseReleased", to);
      await until(
        () =>
          run(
            (count) =>
              document.querySelectorAll(".embedded-canvas-modal .shape-card")
                .length ===
              count + 1,
            count,
          ),
        "Drag did not create shape",
      );
      await click("撤销画布修改");
      await until(
        () =>
          run(
            (count) =>
              document.querySelectorAll(".embedded-canvas-modal .shape-card")
                .length === count,
            count,
          ),
        "Drawing undo failed",
      );
      await click("重做画布修改");
      await until(
        () =>
          run(
            (count) =>
              document.querySelectorAll(".embedded-canvas-modal .shape-card")
                .length ===
              count + 1,
            count,
          ),
        "Drawing redo failed",
      );
      await nativeClick(
        ".embedded-canvas-modal .shape-card:last-of-type .canvas-card-body",
        2,
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
    const savedBlock = () =>
      run(async () =>
        (
          await window.canvasFixture.repository("local-device").load()
        ).blocks.find((b) => b.type === "canvas"),
      );
    const selectedScene = JSON.stringify((await savedBlock()).scene);
    // Selection owns keyboard input; hover alone owns the floating controls.
    await nativeClick(".embedded-canvas-preview");
    assert(
      await run(() =>
        document.activeElement?.matches("[data-embedded-canvas]"),
      ),
      "Preview click did not select the canvas",
    );
    await mouse("mouseMoved", { x: 2, y: 80 });
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".embedded-canvas-controls"))
            .visibility === "hidden",
      ),
      "Selected canvas kept the toolbar visible without hover",
    );
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".embedded-canvas-resize"))
            .visibility === "visible",
      ),
      "Selected canvas lost its resize handles",
    );
    await shot("selected-without-hover");
    await key("Return");
    assert(
      await run(() => {
        const canvas = document
          .querySelector("[data-embedded-canvas]")
          .closest("[data-writing-block]");
        const next = canvas.nextElementSibling;
        return (
          !document.querySelector(".embedded-canvas-modal") &&
          next?.contains(document.activeElement) &&
          document.activeElement?.matches(".tiptap")
        );
      }),
      "Enter must create and focus the paragraph immediately below canvas",
    );
    await key("Z", ["meta"]);
    for (const deletionKey of ["Backspace", "Delete"]) {
      await nativeClick(".embedded-canvas-preview");
      await key(deletionKey);
      assert(
        await run(() => !document.querySelector("[data-embedded-canvas]")),
        deletionKey + " did not remove selected canvas",
      );
      await key("Z", ["meta"]);
      await until(
        () => run(() => !!document.querySelector("[data-embedded-canvas]")),
        "Canvas deletion could not be undone",
      );
      assert(
        JSON.stringify((await savedBlock()).scene) === selectedScene,
        "Deletion undo changed scene",
      );
    }
    // Trackpad pinch travels through Chromium's real Ctrl+wheel path.
    const pinchRect = await bounds(".embedded-canvas-preview");
    await run(() => document.activeElement?.blur());
    const gestureBefore = await run(async () => ({
      revision: (await window.canvasFixture.repository("local-device").load())
        .revision,
      scroll: document.querySelector(".notes-scroll").scrollTop,
      width: window.innerWidth,
    }));
    const pinchPoint = {
      x: pinchRect.x + pinchRect.width * 0.7,
      y: pinchRect.y + pinchRect.height * 0.6,
    };
    const localAnchor = await run((p) => {
      const r = document
        .querySelector(".embedded-canvas-world")
        .getBoundingClientRect();
      return { x: (p.x - r.left) / r.width, y: (p.y - r.top) / r.height };
    }, pinchPoint);
    await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      ...pinchPoint,
      deltaX: 0,
      deltaY: -40,
      modifiers: 2,
    });
    await until(
      () =>
        run(
          () =>
            document.querySelector(".embedded-canvas-zoom").textContent !==
            "100%",
        ),
      "Trackpad pinch did not zoom preview",
    );
    assert(
      await run(
        ({ p, anchor, before }) => {
          const r = document
            .querySelector(".embedded-canvas-world")
            .getBoundingClientRect();
          return (
            document.activeElement?.matches("[data-embedded-canvas]") &&
            window.innerWidth === before.width &&
            document.querySelector(".notes-scroll").scrollTop ===
              before.scroll &&
            Math.abs((p.x - r.left) / r.width - anchor.x) < 0.001 &&
            Math.abs((p.y - r.top) / r.height - anchor.y) < 0.001
          );
        },
        { p: pinchPoint, anchor: localAnchor, before: gestureBefore },
      ),
      "Pinch must select canvas, keep its cursor anchor, and leave document viewport unchanged",
    );
    assert(
      win.webContents.getZoomFactor() === 1,
      "Pinch zoomed the entire app",
    );
    assert(
      await run(
        async (rev) =>
          (await window.canvasFixture.repository("local-device").load())
            .revision === rev,
        gestureBefore.revision,
      ),
      "Preview gesture wrote document history",
    );
    await shot("pinch-preview");
    await click("适应画布预览");
    // Native hover must remain reachable across the gap into the floating toolbar.
    const box = await bounds("[data-embedded-canvas]");
    await mouse("mouseMoved", { x: box.x + box.width / 2, y: box.y + 12 });
    const toolbar = await bounds(".embedded-canvas-toolbar");
    await mouse("mouseMoved", {
      x: toolbar.x + toolbar.width / 2,
      y: toolbar.y + toolbar.height / 2,
    });
    assert(
      await run(
        () =>
          getComputedStyle(document.querySelector(".embedded-canvas-controls"))
            .visibility === "visible",
      ),
      "Hover toolbar became unreachable",
    );
    await nativeClick('[aria-label="放大画布预览"]');
    assert(
      await run(
        () =>
          document.querySelector(".embedded-canvas-zoom").textContent ===
          "125%",
      ),
      "Preview zoom failed",
    );
    await nativeClick('[aria-label="适应画布预览"]');
    const canvasDownloaded = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Canvas download timed out")),
        10000,
      );
      win.webContents.session.once("will-download", (_event, item) => {
        const path = join(output, "canvas-download.zip");
        item.setSavePath(path);
        item.once("done", (_event, state) => {
          clearTimeout(timeout);
          state === "completed" ? resolve(path) : reject(Error(state));
        });
      });
    });
    await nativeClick('[aria-label="下载画布"]');
    const downloadPath = await canvasDownloaded;
    const canvasArchive = unzipSync(readFileSync(downloadPath));
    assert(
      Object.keys(canvasArchive).some((k) => k.endsWith("index.html")) &&
        Object.keys(canvasArchive).some((k) => k.endsWith(".nomi.json")),
      "Canvas download missing offline view or editable scene",
    );
    const unchangedScene = JSON.stringify(await scene());
    for (const side of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const b = await bounds("[data-embedded-canvas]");
      await mouse("mouseMoved", { x: b.x + 20, y: b.y + 20 });
      const handle = await bounds(`[data-resize="${side}"]`);
      const from = {
        x: handle.x + handle.width / 2,
        y: handle.y + handle.height / 2,
      };
      await drag(from, {
        x: from.x + (side.includes("w") ? 45 : side.includes("e") ? -45 : 0),
        y: from.y + (side.includes("n") ? -50 : side.includes("s") ? 50 : 0),
      });
      await until(
        async () => !!(await savedBlock()).preview,
        "Resize was not persisted: " + side,
      );
      assert(
        JSON.stringify(await scene()) === unchangedScene,
        "Preview resize changed scene content",
      );
      await shot("resize-" + side);
      await run(() => document.querySelector("[data-embedded-canvas]").focus());
      await key("Z", ["meta"]);
      await until(
        async () => !(await savedBlock()).preview,
        "Resize must undo in one step: " + side,
      );
      await key("Z", ["meta", "shift"]);
      await until(
        async () => !!(await savedBlock()).preview,
        "Resize redo failed: " + side,
      );
      await click("恢复画布自动尺寸");
      await until(
        async () => !(await savedBlock()).preview,
        "Auto size reset failed",
      );
      // Restore the earlier history position for the pre-existing scene undo checks.
      await run(() => document.querySelector("[data-embedded-canvas]").focus());
      await key("Z", ["meta"]);
      await key("Z", ["meta"]);
      await until(
        async () => !(await savedBlock()).preview,
        "History cleanup failed",
      );
    }
    // Esc cancels a live resize without changing saved dimensions.
    const cancelBox = await bounds("[data-embedded-canvas]");
    await mouse("mouseMoved", { x: cancelBox.x + 20, y: cancelBox.y + 20 });
    const cancelHandle = await bounds('[data-resize="s"]');
    const start = { x: cancelHandle.x + 9, y: cancelHandle.y + 9 };
    await run(() => document.querySelector("[data-embedded-canvas]").focus());
    await mouse("mousePressed", start);
    await mouse("mouseMoved", { x: start.x, y: start.y + 90 });
    await key("Escape");
    await mouse("mouseReleased", { x: start.x, y: start.y + 90 });
    assert(!(await savedBlock()).preview, "Cancelled resize persisted");
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
    await until(
      () =>
        run(
          () =>
            !!document.querySelector(".embedded-canvas-modal .canvas-viewport"),
        ),
      "Plus insertion must open canvas too",
    );
    await close();
    await run(() =>
      [...document.querySelectorAll("[data-embedded-canvas]")].at(-1).focus(),
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
    await key("Z", ["meta", "shift"]);
    await until(
      () =>
        run(
          () =>
            document.querySelectorAll("[data-embedded-canvas]").length === 2,
        ),
      "Canvas insertion redo failed",
    );
    assert(
      await run(() => !document.querySelector(".embedded-canvas-modal")),
      "Redo must not reopen an already consumed editing request",
    );
    await key("Z", ["meta"]);
    await until(
      () =>
        run(
          () =>
            document.querySelectorAll("[data-embedded-canvas]").length === 1,
        ),
      "Redo cleanup failed",
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
    win.setSize(1000, 950);
    await until(
      () => run(() => window.innerWidth <= 1000),
      "Narrow name-editing viewport not ready",
    );
    await nativeClick("[data-embedded-canvas]", 2);
    await until(
      () => run(() => !!document.querySelector('[aria-label="画布名称"]')),
      "Name missing",
    );
    assert(
      await run(() => document.activeElement?.matches(".canvas-viewport")),
      "Opening from document must focus canvas rather than Close",
    );
    await nativeClick('[aria-label="画布名称"]');
    await key("A", ["meta"]);
    await win.webContents.insertText("学习流程");
    // macOS CI can constrain BrowserWindow to a smaller virtual display.
    // Find actual empty canvas space instead of clicking beyond its viewport.
    const blank = await run(() => {
      const viewport = document.querySelector(
        ".embedded-canvas-modal .canvas-viewport",
      );
      const r = viewport.getBoundingClientRect();
      for (const x of [0.85, 0.7, 0.9]) {
        for (const y of [0.2, 0.4, 0.7]) {
          const point = { x: r.x + r.width * x, y: r.y + r.height * y };
          if (document.elementFromPoint(point.x, point.y) === viewport)
            return point;
        }
      }
      throw Error("No visible empty canvas space for name blur check");
    });
    await mouse("mousePressed", blank);
    await mouse("mouseReleased", blank);
    assert(
      await run(() => document.activeElement?.matches(".canvas-viewport")),
      "Clicking canvas must finish name editing despite gesture preventDefault",
    );
    await shot("name-after-outside-click");
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
    const gaps = await run(() => {
      const canvas = document.querySelector(".writing-block-canvas");
      const before = canvas.previousElementSibling?.querySelector(".tiptap");
      const after = canvas.nextElementSibling?.querySelector(".tiptap");
      if (!before?.editor || !after?.editor)
        throw Error("Spacing fixture has no adjacent paragraphs");
      before.editor.commands.setContent("Above", { contentType: "markdown" });
      after.editor.commands.setContent("Below", { contentType: "markdown" });
      const a = before.querySelector("p").getBoundingClientRect();
      const b = canvas.getBoundingClientRect();
      const c = after.querySelector("p").getBoundingClientRect();
      return { before: b.top - a.bottom, after: c.top - b.bottom };
    });
    assert(
      Math.abs(gaps.before - gaps.after) < 2,
      "Unequal canvas paragraph gaps: " + JSON.stringify(gaps),
    );
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
    await assertFullCanvas();
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
    console.error(
      await run(() => ({
        counts: [...document.querySelectorAll(".shape-card")].map(
          (e) => e.closest(".canvas-workspace")?.className,
        ),
        text: document.body.innerText.slice(-1000),
      })),
    );
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
