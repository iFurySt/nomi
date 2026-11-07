import { canvasParityChecks } from "./canvas-parity-checks.mjs";
import { uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { build } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, rm, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/canvas");
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
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>',
);
async function checks(phase, expected) {
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (test) => {
    for (let i = 0; i < 250; i++) {
      if (await test()) return;
      await wait(20);
    }
    throw Error(
      "Canvas timed out: " +
        test.toString() +
        "\n" +
        document.body.innerText.slice(-600),
    );
  };
  const button = (label) =>
    document.querySelector(`button[aria-label="${label}"]`);
  const cards = () => [...document.querySelectorAll("[data-placement]")];
  const card = (id) => document.querySelector(`[data-placement="${id}"]`);
  const repo = window.canvasFixture.repository("local-device");
  const saved = () => repo.load();
  const camera = () =>
    JSON.parse(document.querySelector(".canvas-viewport").dataset.camera);
  const input = (el, value) => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const noDialog = () =>
    !document.querySelector(
      '[role="dialog"]:not(.connector-panel):not(.canvas-tool-menu)',
    );
  const choose = (label, value) => {
    const select = document.querySelector(`[aria-label="${label}"]`);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const chooseConnector = async (label, value) => {
    if (label === "连接箭头") {
      for (const [name, active] of [
        ["起点", ["both", "start"].includes(value)],
        ["终点", ["both", "end"].includes(value)],
      ]) {
        button(name + "标记").click();
        await wait(30);
        button(name + " " + (active ? "开放箭头" : "无标记")).click();
        await wait(30);
      }
    } else {
      if (!document.querySelector('[aria-label="线条设置面板"]')) {
        button("线条设置").click();
        await wait(30);
      }
      const names = {
        rounded: "圆角折线",
        elbow: "直角折线",
        straight: "直线",
        curve: "曲线",
        solid: "实线",
        dashed: "虚线",
        dotted: "点线",
      };
      button(names[value]).click();
      await wait(30);
    }
  };
  const applyDsl = async (next) => {
    button("编辑文档 DSL").click();
    await until(() => document.querySelector('[aria-label="文档 DSL 源码"]'));
    input(
      document.querySelector('[aria-label="文档 DSL 源码"]'),
      JSON.stringify(next),
    );
    await wait(30);
    [...document.querySelectorAll(".canvas-dsl-actions button")]
      .find((b) => b.textContent.includes("应用"))
      .click();
    await until(noDialog);
    await until(async () => (await saved()).revision > next.revision);
  };

  if (phase === "endpoint-setup") {
    const d = await saved();
    window.canvasFixture.endpointOriginal ??= structuredClone(d);
    const c = d.board.connectors[0];
    Object.assign(c, {
      routing: expected.routing,
      style: expected.style,
      color: "#408c5b",
      width: 3,
      opacity: 0.7,
      startHead: "diamond",
      endHead: "triangle",
      waypoints: [],
    });
    await applyDsl(d);
    document
      .querySelector(`[data-connector="${c.id}"] .canvas-connection-hit`)
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wait(30);
    const p = document
        .querySelector(`[data-reconnect="${expected.end}"]`)
        .getBoundingClientRect(),
      v = document.querySelector(".canvas-viewport").getBoundingClientRect();
    const blank = [
      { x: v.left + 45, y: v.bottom - 130 },
      { x: v.right - 45, y: v.top + 130 },
      { x: v.left + 45, y: v.top + 160 },
      { x: v.right - 45, y: v.bottom - 150 },
    ].find((p) =>
      cards().every((el) => {
        const r = el.getBoundingClientRect();
        return (
          p.x < r.left - 24 ||
          p.x > r.right + 24 ||
          p.y < r.top - 24 ||
          p.y > r.bottom + 24
        );
      }),
    );
    assert(blank, "No blank endpoint drop target");
    const pointer = { x: p.x + p.width / 2, y: p.y + p.height / 2 },
      line = document.querySelector(
        `[data-connector="${c.id}"] .canvas-connection-line`,
      ),
      fixed = document.querySelector(
        `[data-reconnect="${expected.end === "from" ? "to" : "from"}"]`,
      );
    assert(
      [...document.querySelectorAll("[data-reconnect]")].every(
        (e) => getComputedStyle(e).cursor === "move",
      ),
      "Endpoint cursor is not four-direction move",
    );
    return {
      id: c.id,
      end: expected.end,
      doc: await saved(),
      pointer,
      blank,
      dx: Math.round(blank.x - pointer.x),
      dy: Math.round(blank.y - pointer.y),
      camera: camera(),
      viewport: { x: v.left, y: v.top },
      path: line.getAttribute("d"),
      fixed: {
        x: Number(fixed.getAttribute("cx")),
        y: Number(fixed.getAttribute("cy")),
      },
    };
  }
  if (phase === "endpoint-jitter-setup") {
    const d = await saved(),
      c = structuredClone(
        window.canvasFixture.endpointOriginal.board.connectors[0],
      ),
      cam = camera();
    d.board.placements = structuredClone(
      window.canvasFixture.endpointOriginal.board.placements,
    );
    const v = document
      .querySelector(".canvas-viewport")
      .getBoundingClientRect();
    const world = (x, y) => ({
      x: (x - v.left - cam.x) / cam.zoom,
      y: (y - v.top - cam.y) / cam.zoom,
    });
    const source = d.board.placements.find((p) => p.id === c.from.placement),
      target = d.board.placements.find((p) => p.id === c.to.placement);
    const sx = Math.round(v.left + 300),
      sy = Math.round(v.top + 300),
      tx = Math.round(v.left + 800),
      ty = sy;
    Object.assign(source, world(sx, sy), {
      width: 200 / cam.zoom,
      height: 120 / cam.zoom,
    });
    Object.assign(target, world(tx, ty), {
      width: 220 / cam.zoom,
      height: 160 / cam.zoom,
    });
    if (expected.mode.startsWith("edge-")) {
      const shape =
        expected.mode === "edge-diamond"
          ? "diamond"
          : expected.mode === "edge-ellipse"
            ? "ellipse"
            : expected.mode === "edge-round"
              ? "rounded-rectangle"
              : "rectangle";
      target.content = "shape.boundary";
      d.blocks = d.blocks.filter((b) => b.id !== "shape.boundary");
      d.blocks.push({
        id: "shape.boundary",
        type: "shape",
        shape,
        text: "边缘吸附",
        tone: "blue",
      });
    }
    if (expected.mode.startsWith("self-")) {
      source.content = "shape.self";
      d.blocks = d.blocks.filter((b) => b.id !== "shape.self");
      d.blocks.push({
        id: "shape.self",
        type: "shape",
        shape: "rectangle",
        text: "收集问题",
        tone: "sage",
      });
      Object.assign(c, {
        color: "#222222",
        width: 2,
        opacity: 1,
        startHead: "none",
        endHead: "arrow",
        startArrow: false,
        endArrow: true,
        label: "",
      });
    }
    d.board.placements = [source, target];
    c.from = { placement: source.id, side: "e" };
    c.to = { placement: target.id, side: "n" };
    if (expected.end === "from") [c.from, c.to] = [c.to, c.from];
    Object.assign(c, { routing: "rounded", style: "solid", waypoints: [] });
    d.board.connectors = expected.end === "new" ? [] : [c];
    await applyDsl(d);
    if (expected.end === "new") button("连接工具").click();
    else
      document
        .querySelector(`[data-connector="${c.id}"] .canvas-connection-hit`)
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wait(20);
    const r = document
      .querySelector(
        expected.end === "new"
          ? `[data-placement="${source.id}"] [data-port="e"]`
          : `[data-reconnect="${expected.end}"]`,
      )
      .getBoundingClientRect();
    const edgePoints = {
      "self-bottom": { x: sx + 166, y: sy + 122 },
      "self-same": { x: sx + 202, y: sy + 30 },
      "self-opposite": { x: sx - 2, y: sy + 60 },
      "self-port": { x: sx + 200, y: sy + 60 },
      "edge-top": { x: tx + 55, y: ty - 2 },
      "edge-left": { x: tx - 2, y: ty + 40 },
      "edge-diamond": { x: tx + 55, y: ty + 40 },
      "edge-ellipse": {
        x: tx + Math.round(110 * (1 - Math.SQRT1_2)),
        y: ty + Math.round(80 * (1 - Math.SQRT1_2)),
      },
      "edge-round": { x: tx + 2, y: ty + 2 },
    };
    const base =
      edgePoints[expected.mode] ??
      (expected.mode === "lane"
        ? { x: sx - 100, y: sy + 60 }
        : expected.mode === "heading"
          ? { x: sx + 400, y: sy - 140 }
          : expected.mode === "snap-edge"
            ? { x: tx - 16, y: ty + 80 }
            : { x: tx + 110, y: ty + 80 });
    const samples = Array.from({ length: 17 }, (_, i) => ({
      x: base.x + (expected.mode === "snap-edge" ? (i % 2 ? -1 : 1) : 0),
      y: base.y + (expected.mode !== "snap-edge" ? (i % 2 ? -1 : 1) : 0),
    }));
    if (expected.mode === "heading") samples[0].y = base.y + 1;
    if (expected.mode === "lane") samples[0].y = base.y;
    if (expected.mode === "snap-midline") samples[0].y = base.y - 1;
    window.canvasFixture.jitter = null;
    return {
      ...expected,
      id: c.id,
      target: expected.mode.startsWith("self-") ? source.id : target.id,
      arm: expected.mode.startsWith("self-")
        ? { x: sx + 270, y: sy + 60 }
        : null,
      fixed: { placement: source.id, side: "e" },
      zoom: cam.zoom,
      doc: await saved(),
      pointer: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      samples,
    };
  }
  if (phase === "endpoint-jitter-check") {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const line = document.querySelector(
        expected.end === "new"
          ? ".canvas-connection-preview"
          : `[data-connector="${expected.id}"] .canvas-connection-line`,
      ),
      length = line.getTotalLength(),
      samples = Array.from({ length: 65 }, (_, i) => {
        const p = line.getPointAtLength((length * i) / 64);
        return { x: p.x, y: p.y };
      });
    assert(
      length > 0 &&
        (expected.end === "new" ||
          !document.querySelector(".canvas-connection-preview")),
      "Jitter lost original line",
    );
    const prev = window.canvasFixture.jitter;
    if (prev) {
      const jump =
        Math.max(
          ...samples.map((p, i) =>
            Math.hypot(p.x - prev.samples[i].x, p.y - prev.samples[i].y),
          ),
        ) * expected.zoom;
      assert(
        jump < 8,
        "Tiny pointer motion caused route jump: " + expected.mode + " " + jump,
      );
    }
    const port = document.querySelector(
      ".connection-target .canvas-port.is-snapped",
    );
    if (expected.mode.startsWith("snap")) {
      assert(
        port?.closest("[data-placement]").dataset.placement ===
          expected.target &&
          port.dataset.port === (expected.mode === "snap-edge" ? "w" : "n"),
        "Snap target flickered at " + expected.mode,
      );
    } else if (expected.mode.startsWith("edge-")) {
      const dot = document.querySelector(
        `[data-boundary-anchor="${expected.target}"]`,
      );
      assert(dot && !port, "Arbitrary edge did not show its own snap point");
      const r = card(expected.target).getBoundingClientRect(),
        p = dot.getBoundingClientRect();
      const u = (p.x + p.width / 2 - r.x) / r.width,
        v = (p.y + p.height / 2 - r.y) / r.height;
      if (expected.mode === "edge-top")
        assert(
          Math.abs(u - 0.25) < 0.01 && Math.abs(v) < 0.01,
          "Top edge jumped to midpoint",
        );
      if (expected.mode === "edge-left")
        assert(
          Math.abs(u) < 0.01 && Math.abs(v - 0.25) < 0.02,
          "Left edge jumped to midpoint",
        );
      if (expected.mode === "edge-diamond")
        assert(
          Math.abs(u + v - 0.5) < 0.02,
          "Diamond snapped to its bounding box",
        );
      if (expected.mode === "edge-ellipse")
        assert(
          Math.abs((u - 0.5) ** 2 / 0.25 + (v - 0.5) ** 2 / 0.25 - 1) < 0.02,
          "Ellipse snapped to its bounding box",
        );
      if (expected.mode === "edge-round")
        assert(
          u > 0 && v > 0 && u < 0.08 && v < 0.08,
          "Rounded corner was not projected",
        );
    } else if (expected.mode.startsWith("self-")) {
      const r = expected.doc.board.placements.find(
          (p) => p.id === expected.target,
        ),
        dot = document.querySelector(
          `[data-boundary-anchor="${expected.target}"]`,
        );
      assert(
        document.querySelector(".connection-target")?.dataset.placement ===
          expected.target,
        "Source shape did not accept self binding",
      );
      assert(dot || port, "Self connection has no snapped endpoint");
      assert(
        !document.querySelector('[aria-label="连接属性"]'),
        "Toolbar obstructs live self connection",
      );
      for (const p of samples)
        assert(
          !(
            p.x > r.x + 0.01 &&
            p.x < r.x + r.width - 0.01 &&
            p.y > r.y + 0.01 &&
            p.y < r.y + r.height - 0.01
          ),
          "Self-loop cut through the shape",
        );
      if (expected.mode === "self-bottom") {
        const y = Number(dot.getAttribute("cy"));
        assert(
          Math.abs(y - r.y - r.height) < 0.001,
          "Self-loop did not bind bottom edge",
        );
        const beforeEnd = line.getPointAtLength(
            expected.end === "from" ? 1 : length - 1,
          ),
          endpoint = line.getPointAtLength(
            expected.end === "from" ? 0 : length,
          );
        assert(
          beforeEnd.y > endpoint.y,
          "Self-loop did not enter bottom from below",
        );
      }
    } else assert(!port, "Free drag unexpectedly snapped");
    assert(
      JSON.stringify(await saved()) === JSON.stringify(expected.doc),
      "Jitter wrote preview to document",
    );
    window.canvasFixture.jitter = { samples, path: line.getAttribute("d") };
    return;
  }
  if (phase === "endpoint-jitter-done") {
    await until(async () => (await saved()).revision > expected.doc.revision);
    const d = await saved(),
      c = d.board.connectors[0],
      fixed = expected.end === "from" ? "to" : "from";
    assert(
      d.revision === expected.doc.revision + 1,
      "Jitter produced multiple history entries",
    );
    assert(
      JSON.stringify(c[fixed]) ===
        JSON.stringify(
          expected.end === "new"
            ? expected.fixed
            : expected.doc.board.connectors[0][fixed],
        ),
      "Jitter moved fixed endpoint",
    );
    assert(
      document
        .querySelector(`[data-connector="${c.id}"] .canvas-connection-line`)
        .getAttribute("d") === window.canvasFixture.jitter.path,
      "Stable route changed on release",
    );
    if (
      expected.mode.startsWith("edge-") ||
      expected.mode === "self-bottom" ||
      expected.mode === "self-same"
    ) {
      const moving = expected.end === "from" ? "from" : "to";
      assert(
        c[moving].placement === expected.target && c[moving].anchor,
        "Edge binding was stored as a free point or key port",
      );
      const next = structuredClone(d),
        p = next.board.placements.find((p) => p.id === expected.target);
      p.x += 20 / expected.zoom;
      p.y += 12 / expected.zoom;
      p.width += 40 / expected.zoom;
      p.height += 20 / expected.zoom;
      await applyDsl(next);
      document
        .querySelector(`[data-connector="${c.id}"] .canvas-connection-hit`)
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await wait(20);
      const handle = document.querySelector(`[data-reconnect="${moving}"]`),
        a = c[moving].anchor;
      assert(
        Math.abs(Number(handle.getAttribute("cx")) - p.x - a.x * p.width) <
          0.001 &&
          Math.abs(Number(handle.getAttribute("cy")) - p.y - a.y * p.height) <
            0.001,
        "Bound edge did not follow move/resize",
      );
      button("撤销画布修改").click();
      await until(
        async () =>
          JSON.stringify((await saved()).board.placements) ===
          JSON.stringify(d.board.placements),
      );
      if (expected.persist)
        return {
          original: window.canvasFixture.endpointOriginal,
          doc: await saved(),
          id: c.id,
          end: moving,
          anchor: c[moving].anchor,
          target: expected.target,
        };
    }
    if (expected.mode.startsWith("self-"))
      assert(
        c.from.placement === c.to.placement &&
          c.from.placement === expected.target,
        "Self-loop was persisted as a free endpoint",
      );
    button("撤销画布修改").click();
    await until(
      async () =>
        JSON.stringify((await saved()).board.connectors) ===
        JSON.stringify(expected.doc.board.connectors),
    );
    return;
  }
  if (phase === "boundary-restored") {
    await until(() => document.querySelector(".canvas-viewport"));
    window.canvasFixture.endpointOriginal = expected.original;
    await until(
      async () =>
        JSON.stringify((await saved()).board.connectors) ===
        JSON.stringify(expected.doc.board.connectors),
    );
    document
      .querySelector(`[data-connector="${expected.id}"] .canvas-connection-hit`)
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wait(20);
    const p = expected.doc.board.placements.find(
        (p) => p.id === expected.target,
      ),
      h = document.querySelector(`[data-reconnect="${expected.end}"]`);
    assert(
      Math.abs(
        Number(h.getAttribute("cx")) - p.x - expected.anchor.x * p.width,
      ) < 0.001 &&
        Math.abs(
          Number(h.getAttribute("cy")) - p.y - expected.anchor.y * p.height,
        ) < 0.001,
      "Refresh lost relative edge binding",
    );
    return;
  }
  if (phase === "end-clearance-check") {
    const d = await saved(),
      c = d.board.connectors.find((c) => c.id === expected.id);
    const root = document.querySelector(`[data-connector="${c.id}"]`),
      line = root.querySelector(".canvas-connection-line"),
      hit = root.querySelector(".canvas-connection-hit");
    const logical = hit.getAttribute("d"),
      before = JSON.stringify(d.board.connectors);
    for (const action of [
      null,
      "缩小画布",
      "缩小画布",
      "放大画布",
      "重置为 100%",
    ]) {
      if (action) {
        button(action).click();
        await wait(30);
      }
      const zoom = camera().zoom;
      assert(
        hit.getAttribute("d") === logical,
        "Ink clearance changed binding route under zoom",
      );
      for (const end of ["from", "to"]) {
        const painted = line.getPointAtLength(
            end === "from" ? 0 : line.getTotalLength(),
          ),
          bound = hit.getPointAtLength(
            end === "from" ? 0 : hit.getTotalLength(),
          ),
          handle = document.querySelector(`[data-reconnect="${end}"]`);
        assert(
          Math.abs(Number(handle.getAttribute("cx")) - bound.x) < 0.001 &&
            Math.abs(Number(handle.getAttribute("cy")) - bound.y) < 0.001,
          "Ink inset moved logical endpoint handle",
        );
        const distance =
          Math.hypot(painted.x - bound.x, painted.y - bound.y) * zoom;
        assert(
          distance > 4 && distance < 5.5,
          "Bound ink has no stable screen-space clearance: " + distance,
        );
      }
      assert(
        JSON.stringify((await saved()).board.connectors) === before,
        "Zoom/inset rewrote document bindings",
      );
    }
    for (const marker of document.querySelectorAll(
      ".canvas-connection-layer defs marker",
    )) {
      const g = marker.querySelector("g"),
        box = g.getBBox(),
        ref = marker.refX.baseVal.value;
      assert(
        Math.abs(ref - (box.x + box.width)) < 0.001,
        "Marker centerline is offset from the shaft endpoint: " + marker.id,
      );
    }
    return;
  }
  if (phase === "arrow-tip-check") {
    // Rasterize the real marker against an independent, continuous V + shaft.
    // This catches a protruding center stem even when clearance distances pass.
    const arrow = document.querySelector('marker[id$="-arrow"]'),
      raster = async (body) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">${body}</svg>`,
          url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 120;
          canvas.height = 80;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, 120, 80).data;
        } finally {
          URL.revokeObjectURL(url);
        }
      };
    for (const width of [1, 2, 4])
      for (const zoom of [0.5, 1, 2.5])
        for (const end of ["start", "end"]) {
          const style = `fill="none" stroke="black" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`,
            actual = await raster(
              `<defs>${arrow.outerHTML}</defs><g transform="scale(${zoom})"><path ${style} vector-effect="non-scaling-stroke" d="M ${20 / zoom} ${40 / zoom} H ${80 / zoom}" marker-${end}="url(#${arrow.id})"/></g>`,
            ),
            scale = (width * 10) / 16,
            tip = end === "end" ? 80 : 20,
            back = tip + (end === "end" ? -7 : 7) * scale,
            reference = await raster(
              `<path ${style} d="M 20 40 H 80 M ${back} ${40 - 5 * scale} L ${tip} 40 L ${back} ${40 + 5 * scale}"/>`,
            );
          let error = 0,
            ink = 0;
          for (let i = 3; i < actual.length; i += 4) {
            error += Math.abs(actual[i] - reference[i]);
            ink += reference[i];
          }
          assert(
            error / ink < 0.04,
            `Arrow/shaft join differs from a clean V: width=${width}, zoom=${zoom}, ${end}, error=${error / ink}`,
          );
        }
    return;
  }
  if (phase === "endpoint-pressed") {
    assert(
      document
        .querySelector(
          `[data-connector="${expected.id}"] .canvas-connection-line`,
        )
        .getAttribute("d") === expected.path,
      "Pressing endpoint made original line jump",
    );
    assert(
      JSON.stringify(await saved()) === JSON.stringify(expected.doc),
      "Pressing endpoint committed a change",
    );
    return;
  }
  if (phase === "endpoint-live") {
    const old = expected.doc.board.connectors.find((c) => c.id === expected.id),
      line = document.querySelector(
        `[data-connector="${expected.id}"] .canvas-connection-line`,
      ),
      fixed = document.querySelector(
        `[data-reconnect="${expected.end === "from" ? "to" : "from"}"]`,
      ),
      moving = document.querySelector(`[data-reconnect="${expected.end}"]`);
    assert(
      line && line.getAttribute("d") !== expected.path,
      "Original line did not follow the dragged endpoint",
    );
    assert(
      !document.querySelector(".canvas-connection-preview"),
      "Reconnect replaced original line with a dashed ghost",
    );
    const dash = line.getAttribute("stroke-dasharray") ?? "";
    assert(
      dash ===
        (old.style === "dashed" ? "8 6" : old.style === "dotted" ? "1 5" : ""),
      "Drag changed original line pattern",
    );
    assert(
      line.getAttribute("stroke-width") === "3" &&
        line.getAttribute("opacity") === "0.7" &&
        line.style.stroke === "rgb(64, 140, 91)",
      "Drag lost original stroke formatting",
    );
    assert(
      line.getAttribute("marker-start")?.includes("diamond") &&
        line.getAttribute("marker-end")?.includes("triangle"),
      "Moving start reversed arrowheads",
    );
    assert(
      Number(fixed.getAttribute("cx")) === expected.fixed.x &&
        Number(fixed.getAttribute("cy")) === expected.fixed.y,
      "Opposite endpoint moved",
    );
    const x =
        (Math.round(expected.pointer.x) +
          expected.dx -
          expected.viewport.x -
          expected.camera.x) /
        expected.camera.zoom,
      y =
        (Math.round(expected.pointer.y) +
          expected.dy -
          expected.viewport.y -
          expected.camera.y) /
        expected.camera.zoom;
    assert(
      Math.abs(Number(moving.getAttribute("cx")) - x) < 1 &&
        Math.abs(Number(moving.getAttribute("cy")) - y) < 1,
      "Dragged endpoint does not track pointer",
    );
    assert(
      JSON.stringify(await saved()) === JSON.stringify(expected.doc),
      "Drag preview committed before release",
    );
    window.canvasFixture.endpointPreviewPath = line.getAttribute("d");
    return;
  }
  if (phase === "endpoint-committed") {
    const old = expected.doc.board.connectors.find((c) => c.id === expected.id);
    await until(
      async () =>
        JSON.stringify(
          (await saved()).board.connectors.find((c) => c.id === expected.id),
        ) !== JSON.stringify(old),
    );
    const d = await saved(),
      c = d.board.connectors.find((c) => c.id === expected.id),
      fixed = expected.end === "from" ? "to" : "from";
    assert(
      JSON.stringify(c[fixed]) === JSON.stringify(old[fixed]),
      "Commit moved opposite endpoint",
    );
    assert(c[expected.end].point, "Free endpoint did not persist");
    assert(
      document
        .querySelector(
          `[data-connector="${expected.id}"] .canvas-connection-line`,
        )
        .getAttribute("d") === window.canvasFixture.endpointPreviewPath,
      "Release changed live route",
    );
    assert(
      d.revision === expected.doc.revision + 1,
      "Endpoint drag not a single undo action",
    );
    assert(
      JSON.stringify(d.board.placements) ===
        JSON.stringify(expected.doc.board.placements),
      "Endpoint drag moved shapes",
    );
    button("撤销画布修改").click();
    await until(
      async () =>
        JSON.stringify(
          (await saved()).board.connectors.find((c) => c.id === expected.id),
        ) === JSON.stringify(old),
    );
    return;
  }
  if (phase === "endpoint-cancelled") {
    assert(
      JSON.stringify(await saved()) === JSON.stringify(expected.doc),
      "Cancelled endpoint drag changed document",
    );
    return;
  }
  if (phase === "endpoint-restore") {
    const d = window.canvasFixture.endpointOriginal;
    d.revision = (await saved()).revision;
    await applyDsl(d);
    return {
      endpointMoveCursor: true,
      endpointNoPressJump: true,
      endpointFixedOpposite: true,
      endpointLiveOriginalStyle: true,
      endpointPreviewMatchesCommit: true,
      endpointCancelUndo: true,
    };
  }
  if (phase === "tools-setup") {
    let d = await saved();
    d.board.placements = d.board.placements
      .filter((p) => ["place.start", "place.questions"].includes(p.id))
      .map((p, i) => ({ ...p, x: i * 610, y: 0, width: 350, height: 270 }));
    d.board.connectors = [];
    d.blocks.find((b) => b.id === "text.start").source =
      "## 从问题到理解\n\n记录想法，连接证据，再通过交互验证。\n\n- 写下问题\n- 关联资料\n- 建立自己的知识网络";
    d.blocks.find((b) => b.id === "text.questions").source =
      "## 观察与验证\n\n让笔记和图形互相连接，清晰呈现推理过程。\n\n行内公式：$E=mc^2$";
    await applyDsl(d);
    const ids = [];
    for (const [shape, text, tone] of [
      ["rectangle", "收集问题", "sage"],
      ["diamond", "建立联系", "sand"],
      ["ellipse", "验证与理解", "blue"],
    ]) {
      const count = cards().length;
      // Tool gestures are covered by check-notes-canvas; seed geometry for routing checks.
      const next = await saved();
      const blockId = `tools.${shape}`,
        placeId = `tools.place.${shape}`;
      next.blocks.push({
        id: blockId,
        type: "shape",
        shape,
        text: "",
        tone,
      });
      next.board.placements.push({
        id: placeId,
        content: blockId,
        x: 0,
        y: 0,
        width: 280,
        height: 180,
      });
      await applyDsl(next);
      await until(() => cards().length === count + 1);
      card(placeId)
        .querySelector(".canvas-card-body")
        .dispatchEvent(
          new MouseEvent("dblclick", { bubbles: true, detail: 2 }),
        );
      await until(() => document.querySelector("[data-shape-text]"));
      const editor = document.querySelector("[data-shape-text]");
      ids.push(editor.closest("[data-placement]").dataset.placement);
      input(editor, text);
      await wait(30);
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await until(() => !document.querySelector("[data-shape-text]"));
      await until(
        () =>
          document.querySelector(".canvas-save-status").textContent ===
          "已保存到本机",
      );
    }
    d = await saved();
    ids.forEach((id, i) =>
      Object.assign(
        d.board.placements.find((p) => p.id === id),
        { x: i * 360, y: 380, width: 240, height: 140 },
      ),
    );
    await applyDsl(d);
    // Shape geometry, selection edges and handle centers share one boundary,
    // including at non-default zoom. A percentage inset creates a visible gap.
    for (const zoomAction of ["缩小画布", "重置为 100%", "放大画布"]) {
      button(zoomAction).click();
      await wait(30);
      for (const id of ids) {
        const node = card(id);
        const shape = node
          .querySelector(".canvas-shape-content svg > *")
          .getBoundingClientRect();
        const controls = node
          .querySelector(".canvas-card-controls")
          .getBoundingClientRect();
        for (const dimension of ["left", "top", "right", "bottom"]) {
          assert(
            Math.abs(shape[dimension] - controls[dimension]) < 0.1,
            `Shape ${id} has a gap from its ${dimension} selection edge`,
          );
        }
        for (const direction of ["nw", "ne", "sw", "se"]) {
          const handle = node
            .querySelector(`[data-resize="${direction}"]`)
            .getBoundingClientRect();
          assert(
            Math.abs(
              handle.x +
                handle.width / 2 -
                shape[direction.includes("w") ? "left" : "right"],
            ) < 0.1 &&
              Math.abs(
                handle.y +
                  handle.height / 2 -
                  shape[direction.includes("n") ? "top" : "bottom"],
              ) < 0.1,
            `Shape ${id} corner ${direction} is detached`,
          );
        }
      }
    }
    button("适应画布内容").click();
    await wait(80);
    const current = await saved(),
      ellipse = card(ids[2]);
    const handles = [...ellipse.querySelectorAll("[data-resize]")];
    assert(
      handles.filter((h) => getComputedStyle(h, "::after").display !== "none")
        .length === 4,
      "Selection has more than four visible resize anchors",
    );
    for (const h of handles) {
      const direction = h.dataset.resize,
        wanted = {
          n: "ns-resize",
          s: "ns-resize",
          e: "ew-resize",
          w: "ew-resize",
          ne: "nesw-resize",
          sw: "nesw-resize",
          nw: "nwse-resize",
          se: "nwse-resize",
        }[direction];
      assert(
        getComputedStyle(h).cursor === wanted,
        `Wrong ${direction} resize cursor`,
      );
      const r = h.getBoundingClientRect();
      assert(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === h,
        `Resize ${direction} is covered by shape content`,
      );
    }
    const ports = [...ellipse.querySelectorAll("[data-port]")];
    assert(
      ports.length === 4 &&
        ports.every((p) => getComputedStyle(p).display !== "none"),
      "Selected shape must expose four connection dots without changing tools",
    );
    const r = ellipse
      .querySelector(".canvas-shape-content > span")
      .getBoundingClientRect();
    return {
      ids,
      doc: current,
      camera: camera(),
      pointer: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    };
  }
  if (phase === "tools-snapping") {
    await until(
      () => document.querySelectorAll("[data-snap-guide]").length > 0,
    );
    const p = card(expected.ids[2]);
    assert(
      Math.abs(parseFloat(p.style.left) - 720) < 1,
      "Drag did not snap to aligned edge",
    );
    return;
  }
  if (phase === "tools-select-rectangle") {
    button("选择工具").click();
    const node = card(expected.id);
    node
      .querySelector(".canvas-card-body")
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await until(() => node.querySelector("[data-shape-text]"));
    node
      .querySelector("[data-shape-text]")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await wait(30);
    const rect = node.querySelector(".canvas-shape-content rect");
    assert(
      rect && rect.rx.baseVal.value === 0,
      "Rectangle must have square corners at its resize anchors",
    );
    const selection = getComputedStyle(
      node.querySelector(".canvas-card-controls"),
      "::before",
    );
    assert(
      Math.abs(
        parseFloat(selection.left) + parseFloat(selection.borderLeftWidth) / 2,
      ) < 0.1,
      "Selection stroke must be centered on the rectangle boundary",
    );
    return;
  }
  if (phase === "tools-body") {
    const p = card(expected.id),
      r = p
        .querySelector(".canvas-shape-content > span")
        .getBoundingClientRect();
    return {
      pointer: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      placement: (await saved()).board.placements.find(
        (p) => p.id === expected.id,
      ),
      camera: camera(),
    };
  }
  if (phase === "tools-doubled") {
    await until(() => card(expected.id).querySelector("[data-shape-text]"));
    assert(cards().length === 5, "Double-clicking a shape created a new note");
    card(expected.id)
      .querySelector("[data-shape-text]")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await wait(30);
    return;
  }
  if (phase === "tools-motion-check") {
    const before = expected.before;
    await until(
      async () =>
        (await saved()).board.placements.find(
          (p) => p.id === before.placement.id,
        ).y !== before.placement.y,
    );
    const p = (await saved()).board.placements.find(
      (p) => p.id === before.placement.id,
    );
    assert(
      Math.abs(p.x - before.placement.x - expected.dx / before.camera.zoom) <
        2 &&
        Math.abs(p.y - before.placement.y - expected.dy / before.camera.zoom) <
          2,
      "Alt bypass / Shift axis lock failed",
    );
    button("撤销画布修改").click();
    await until(
      async () =>
        (await saved()).board.placements.find(
          (p) => p.id === before.placement.id,
        ).y === before.placement.y,
    );
    return;
  }
  if (phase === "tools-port") {
    if (expected.direct) {
      button("选择工具").click();
      card(expected.from)
        .querySelector(".canvas-card-body")
        .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await until(() => card(expected.from).querySelector("[data-shape-text]"));
      card(expected.from)
        .querySelector("[data-shape-text]")
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      await wait(30);
    } else if (button("连接工具").getAttribute("aria-pressed") !== "true")
      button("连接工具").click();
    await wait(30);
    const get = (id, side) => {
      const port = card(id).querySelector(`[data-port="${side}"]`);
      // In selection mode target dots only appear once the drag starts.
      if (id === expected.to) {
        const r = card(id).getBoundingClientRect();
        return {
          x: side === "w" ? r.left : side === "e" ? r.right : r.x + r.width / 2,
          y:
            side === "n" ? r.top : side === "s" ? r.bottom : r.y + r.height / 2,
        };
      }
      const r = port.getBoundingClientRect();
      assert(
        getComputedStyle(port).display !== "none" &&
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
            port,
        `Connection dot ${id}/${side} must be visible and above content: ${getComputedStyle(port).display}, ${r.x},${r.y}, hit=${document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 250)}`,
      );
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    return {
      from: get(expected.from, expected.fromSide),
      to: get(expected.to, expected.toSide),
      count: (await saved()).board.connectors?.length ?? 0,
    };
  }
  if (phase === "tools-connecting") {
    await until(() => document.querySelector(".canvas-connection-preview"));
    assert(
      button("选择工具").getAttribute("aria-pressed") === "true",
      "Direct port drag switched tools",
    );
    // Only a nearby target exposes its boundary ports, not every object on the canvas.
    assert(
      document.querySelector(".connection-source"),
      "Source anchors are missing",
    );
    return;
  }
  if (phase === "tools-connected") {
    await until(
      async () =>
        ((await saved()).board.connectors?.length ?? 0) === expected.count + 1,
    );
    const c = (await saved()).board.connectors.at(-1);
    const el = document.querySelector(`[data-connector="${c.id}"]`);
    el.querySelector(".canvas-connection-hit").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    await until(() =>
      document.querySelector(
        '[aria-label="添加连线文字"], [aria-label="编辑连线文字"]',
      ),
    );
    if (button("添加连线文字")) {
      const bar = document
        .querySelector(".connector-toolbar")
        .getBoundingClientRect();
      assert(
        bar.height <= 40 && bar.width <= 340,
        `Connector toolbar is too large: ${bar.width} x ${bar.height}`,
      );
    }
    (button("添加连线文字") ?? button("编辑连线文字")).click();
    await until(() => document.querySelector('[aria-label="连接文字"]'));
    input(document.querySelector('[aria-label="连接文字"]'), expected.label);
    await chooseConnector("连接线型", expected.style ?? "solid");
    await chooseConnector("连接箭头", expected.arrows ?? "end");
    await chooseConnector("连接路径", expected.routing ?? "curve");
    if (document.querySelector('[aria-label="线条设置面板"]'))
      button("线条设置").click();
    await wait(60);
    const next = (await saved()).board.connectors.at(-1);
    assert(
      next.label === expected.label &&
        next.style === (expected.style ?? "solid"),
      "Connector property update failed",
    );
    assert(
      !!el.querySelector(".canvas-connection-line").getAttribute("marker-end"),
      "Arrow marker missing",
    );
    const end = document
      .querySelector('[data-reconnect="to"]')
      .getBoundingClientRect();
    return {
      connector: next,
      pointer: { x: end.x + end.width / 2, y: end.y + end.height / 2 },
    };
  }
  if (phase === "tools-target") {
    const el = card(expected.id),
      r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 1 };
  }
  if (phase === "tools-retargeted") {
    await until(
      async () =>
        (await saved()).board.connectors[0].to.placement === expected.id,
    );
    button("撤销画布修改").click();
    await until(
      async () =>
        (await saved()).board.connectors[0].to.placement === "place.questions",
    );
    return;
  }
  if (phase === "tools-target-snapped") {
    const node = card(expected.id);
    assert(
      node.classList.contains("connection-target"),
      "Nearby shape was not detected",
    );
    const ports = [...node.querySelectorAll("[data-port]")];
    assert(
      ports.length === 4 &&
        ports.every((p) => getComputedStyle(p).display !== "none"),
      "Target key anchors were not revealed",
    );
    const port = node.querySelector(`[data-port="${expected.side}"]`),
      r = port.getBoundingClientRect(),
      shape = node.getBoundingClientRect();
    assert(
      port.classList.contains("is-snapped"),
      "Snapped key anchor is not highlighted",
    );
    assert(
      Math.abs(r.x + r.width / 2 - shape.left) < 1.1,
      "Target anchor does not sit on the shape boundary",
    );
    return;
  }
  if (phase === "toolbar-segment-before") {
    await until(() => !document.querySelector(".connector-panel"));
    await wait(40);
    const el = document.querySelector("[data-segment]"),
      r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2,
    );
    assert(
      hit === el,
      `Segment handle is covered: ${hit?.outerHTML.slice(0, 350)}`,
    );
    const c = (await saved()).board.connectors.find(
      (c) => c.id === expected.id,
    );
    return {
      connector: c,
      dx: getComputedStyle(el).cursor === "ew-resize" ? 34 : 0,
      dy: getComputedStyle(el).cursor === "ns-resize" ? 34 : 0,
      path: document
        .querySelector(`[data-connector="${c.id}"] .canvas-connection-line`)
        .getAttribute("d"),
      pointer: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    };
  }
  if (phase === "toolbar-segment-after") {
    const c = (await saved()).board.connectors.find(
      (c) => c.id === expected.connector.id,
    );
    assert(
      c.waypoints.length > 0,
      `Segment drag did not save bends: ${JSON.stringify(expected)}`,
    );
    assert(
      JSON.stringify(c.from) === JSON.stringify(expected.connector.from) &&
        JSON.stringify(c.to) === JSON.stringify(expected.connector.to),
      "Segment drag changed endpoint bindings",
    );
    assert(
      document
        .querySelector(`[data-connector="${c.id}"] .canvas-connection-line`)
        .getAttribute("d") !== expected.path,
      "Segment drag did not change path",
    );
    button("撤销画布修改").click();
    await wait(40);
    assert(
      JSON.stringify(
        (await saved()).board.connectors.find(
          (c) => c.id === expected.connector.id,
        ),
      ) === JSON.stringify(expected.connector),
      "Segment undo lost original path",
    );
    return;
  }
  const checkPopover = () => {
    const panel = document.querySelector(".connector-panel"),
      bar = panel.closest(".connector-toolbar").getBoundingClientRect(),
      r = panel.getBoundingClientRect(),
      gap = Math.min(
        Math.abs(r.bottom - bar.top),
        Math.abs(r.top - bar.bottom),
      );
    assert(
      Math.abs(gap - 6) < 1.1,
      "Popover drifted away from toolbar: " + gap,
    );
    assert(
      r.left >= 11 &&
        r.right <= innerWidth - 11 &&
        r.top >= 11 &&
        r.bottom <= innerHeight - 11,
      "Popover escaped viewport",
    );
    assert(
      r.width <= 224.5 && panel.scrollWidth <= panel.clientWidth + 1,
      "Popover is oversized or overflows horizontally",
    );
  };
  if (phase === "toolbar-details") {
    const d = await saved(),
      id = d.board.connectors[1].id;
    const select = async (cid) => {
      document
        .querySelector(`[data-connector="${cid}"] .canvas-connection-hit`)
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await wait(30);
    };
    const menuButton = (label) =>
      [...document.querySelectorAll(".connector-menu button")].find((b) =>
        b.textContent.trim().startsWith(label),
      );
    const more = async (label) => {
      (button("更多操作") ?? button("更多操作（已锁定）")).click();
      await wait(30);
      const b = menuButton(label);
      assert(b, `Missing more action ${label}`);
      b.click();
      await wait(40);
    };
    await select(id);
    for (const label of [
      "起点标记",
      "终点标记",
      "连线颜色与透明度",
      "线条设置",
      "更多操作",
    ]) {
      button(label).click();
      await wait(40);
      checkPopover();
      if (label.includes("标记")) {
        assert(
          document.querySelector(".connector-panel").getBoundingClientRect()
            .width <= 128.5,
          "Marker panel too wide",
        );
        assert(
          [...document.querySelectorAll(".connector-head-list button")].every(
            (el) => el.getBoundingClientRect().height <= 28.5,
          ),
          "Marker rows are larger than toolbar controls",
        );
      }
      button(label).click();
      await wait(20);
    }
    const shapeBefore = JSON.stringify((await saved()).board.placements);
    button("终点标记").click();
    await wait(30);
    [...document.querySelectorAll(".connector-more-heads")][0].click();
    await wait(30);
    assert(
      document.querySelectorAll(".connector-head-grid button").length === 14,
      "Expanded endpoint catalog missing markers",
    );
    checkPopover();
    button("终点 空心圆").click();
    await wait(30);
    button("交换箭头方向").click();
    await wait(30);
    button("连线颜色与透明度").click();
    await wait(30);
    button("线条颜色 #d84d4d").click();
    input(document.querySelector('[aria-label="连线不透明度"]'), "65");
    await wait(30);
    await chooseConnector("连接路径", "rounded");
    await chooseConnector("连接线型", "dotted");
    button("线宽 4").click();
    button("跨线跳线").click();
    await wait(30);
    button("线条设置").click();
    await wait(30);
    if (!document.querySelector('[aria-label="连接文字"]'))
      if (button("添加连线文字")) {
        const bar = document
          .querySelector(".connector-toolbar")
          .getBoundingClientRect();
        assert(
          bar.height <= 40 && bar.width <= 340,
          `Connector toolbar is too large: ${bar.width} x ${bar.height}`,
        );
      }
    (button("添加连线文字") ?? button("编辑连线文字")).click();
    await wait(30);
    input(document.querySelector('[aria-label="连接文字"]'), "因果关系");
    await wait(30);
    choose("连线字号", "24");
    button("文字格式").click();
    await wait(30);
    for (const name of ["粗体", "斜体", "下划线", "删除线", "左对齐"]) {
      button(name).click();
      await wait(15);
    }
    const link = document.querySelector('[aria-label="连线文字链接"]');
    input(link, "https://example.com/learning");
    link.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await wait(40);
    button("文字格式").click();
    await wait(30);
    let c = (await saved()).board.connectors.find((c) => c.id === id);
    assert(
      c.startHead === "circle-open" &&
        c.color === "#d84d4d" &&
        c.opacity === 0.65 &&
        c.width === 4 &&
        c.style === "dotted" &&
        c.routing === "rounded" &&
        c.lineJumps,
      `Toolbar line settings did not persist: ${JSON.stringify(c)}`,
    );
    assert(
      c.label === "因果关系" &&
        c.labelStyle.bold &&
        c.labelStyle.italic &&
        c.labelStyle.underline &&
        c.labelStyle.strike &&
        c.labelStyle.size === 24 &&
        c.labelStyle.align === "left" &&
        c.labelStyle.link === "https://example.com/learning",
      "Toolbar label settings did not persist",
    );
    assert(
      JSON.stringify((await saved()).board.placements) === shapeBefore,
      "Formatting moved shapes",
    );
    const bar = document
        .querySelector(".connector-toolbar")
        .getBoundingClientRect(),
      layer = document
        .querySelector(".canvas-viewport")
        .getBoundingClientRect();
    assert(
      bar.left >= layer.left &&
        bar.right <= layer.right &&
        bar.bottom <= layer.bottom,
      "Floating toolbar is outside viewport",
    );
    await more("复制样式");
    await more("锁定");
    c = (await saved()).board.connectors.find((c) => c.id === id);
    assert(c.locked, "Lock did not persist");
    assert(
      !document.querySelector("[data-segment]"),
      "Locked line exposes editable segments",
    );
    await more("解锁");
    // The synthetic profile owns a private clipboard; never overwrite the user's clipboard in tests.
    const clip = { text: "", items: [] };
    window.canvasFixture.clipboard = clip;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          clip.text = text;
        },
        readText: async () => clip.text,
        write: async (items) => {
          clip.items = items;
        },
      },
    });
    await more("复制");
    assert(
      JSON.parse(clip.text).schema === "nomi-connector/v1",
      "Copy did not produce a semantic connector",
    );
    await more("复制为图片");
    await until(() => clip.items.length === 1);
    assert(
      (await clip.items[0].getType("image/png")).size > 500,
      "Image clipboard is empty",
    );
    await more("创建副本");
    await until(async () => (await saved()).board.connectors.length === 4);
    let extra = (await saved()).board.connectors.at(-1);
    assert(
      extra.from.point && extra.to.point,
      "Duplicate lost endpoint positions",
    );
    const duplicateId = extra.id,
      oldPoint = extra.from.point;
    await more("旋转 90°");
    extra = (await saved()).board.connectors.find((c) => c.id === duplicateId);
    assert(
      JSON.stringify(extra.from.point) !== JSON.stringify(oldPoint),
      "Rotate did not change geometry",
    );
    (button("更多操作") ?? button("更多操作（已锁定）")).click();
    await wait(30);
    menuButton("层级").click();
    await wait(30);
    menuButton("置于底层").click();
    await wait(30);
    assert(
      (await saved()).board.connectors[0].id === duplicateId,
      "Layer action did not change stacking",
    );
    await more("删除");
    await until(async () => (await saved()).board.connectors.length === 3);
    await select(id);
    await more("粘贴");
    await until(async () => (await saved()).board.connectors.length === 4);
    await more("删除");
    await until(async () => (await saved()).board.connectors.length === 3);
    const other = (await saved()).board.connectors.find((c) => c.id !== id).id;
    await select(other);
    await more("粘贴样式");
    assert(
      (await saved()).board.connectors.find((c) => c.id === other).color ===
        "#d84d4d",
      "Paste style failed",
    );
    await select(id);
    button("线条设置").click();
    await wait(30);
    return {
      id,
      report: {
        floatingConnectorToolbar: true,
        compactAnchoredPopovers: true,
        expandedEndpointMarkers: true,
        connectorColorOpacity: true,
        lineWidthAndPatterns: true,
        richConnectorLabels: true,
        connectorClipboard: true,
        connectorImageClipboard: true,
        connectorDuplicateRotateLayer: true,
        connectorStyleClipboard: true,
        connectorLock: true,
      },
    };
  }
  if (phase === "toolbar-narrow") {
    const c = (await saved()).board.connectors[0];
    document
      .querySelector(`[data-connector="${c.id}"] .canvas-connection-hit`)
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wait(80);
    const bar = document
        .querySelector(".connector-toolbar")
        .getBoundingClientRect(),
      view = document.querySelector(".canvas-viewport").getBoundingClientRect();
    assert(
      bar.left >= view.left &&
        bar.right <= view.right &&
        bar.bottom <= view.bottom,
      "Narrow toolbar escapes the canvas",
    );
    button("线条设置").click();
    await wait(40);
    const panel = document
      .querySelector(".connector-panel")
      .getBoundingClientRect();
    assert(
      panel.left >= 0 &&
        panel.right <= innerWidth &&
        panel.top >= 0 &&
        panel.bottom <= innerHeight,
      "Narrow panel escapes window",
    );
    checkPopover();
    return;
  }
  if (phase === "toolbar-upward-route") {
    const d = await saved(),
      c = d.board.connectors[1];
    c.to = { placement: expected.id, side: "n" };
    c.routing = "rounded";
    c.waypoints = [];
    c.label = "";
    c.startHead = "none";
    c.endHead = "arrow";
    c.startArrow = false;
    c.endArrow = true;
    c.color = "#111111";
    c.width = 2;
    c.opacity = 1;
    c.style = "solid";
    await applyDsl(d);
    const alternate = d.board.connectors.find((link) => link.id !== c.id);
    document
      .querySelector(
        `[data-connector="${alternate.id}"] .canvas-connection-hit`,
      )
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wait(30);
    document
      .querySelector(`[data-connector="${c.id}"] .canvas-connection-hit`)
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wait(60);
    const el = document.querySelector(
        `[data-connector="${c.id}"] .canvas-connection-line`,
      ),
      target = card(expected.id).getBoundingClientRect();
    assert(el.getAttribute("d").includes("Q"), "Upward elbow is not rounded");
    const pills = [...document.querySelectorAll("[data-segment]")].map((p) =>
      p.getBoundingClientRect(),
    );
    assert(
      pills.some((p) => p.y + p.height / 2 < target.top),
      "Route does not go above target before entering its north anchor",
    );
    const bar = document
      .querySelector(".connector-toolbar")
      .getBoundingClientRect();
    assert(
      bar.width <= 340 && bar.height <= 40,
      "Compact toolbar is too large",
    );
    return;
  }
  if (phase === "toolbar-upward-restore") {
    button("撤销画布修改").click();
    await wait(60);
    return;
  }
  if (phase === "connector-resize-setup") {
    const d = await saved(),
      c = d.board.connectors[1];
    const source = d.board.placements.find((p) => p.id === c.from.placement),
      target = d.board.placements.find((p) => p.id === expected.id);
    Object.assign(source, {
      x: target.x - 500,
      y: target.y - 62,
      width: 160,
      height: 160,
    });
    Object.assign(c, {
      to: { placement: target.id, side: "n" },
      routing: "rounded",
      waypoints: [],
      label: "",
      startHead: "none",
      endHead: "arrow",
      color: "#111111",
      width: 2,
      opacity: 1,
      style: "solid",
    });
    await applyDsl(d);
    button("重置为 100%").click();
    card(source.id)
      .querySelector(".canvas-card-body")
      .dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 2 }),
      );
    await wait(50);
    const handle = card(source.id)
      .querySelector('[data-resize="s"]')
      .getBoundingClientRect();
    return {
      id: c.id,
      source: source.id,
      target: target.id,
      pointer: {
        x: handle.x + handle.width / 2,
        y: handle.y + handle.height / 2,
      },
    };
  }
  if (phase === "connector-resize-check") {
    const d = await saved(),
      source = d.board.placements.find((p) => p.id === expected.source),
      target = d.board.placements.find((p) => p.id === expected.target);
    assert(
      Math.abs(source.height - 120) < 1,
      "Native resize did not shrink source",
    );
    assert(
      Math.abs(target.y - source.y - source.height / 2 - 2) < 1,
      "Resize did not reach the near-level port edge case",
    );
    const line = document.querySelector(
      `[data-connector="${expected.id}"] .canvas-connection-line`,
    );
    const path = line.parentElement
      .querySelector(".canvas-connection-hit")
      .getAttribute("d");
    assert(
      path.includes("Q"),
      "Near-level route collapsed into a straight line",
    );
    const length = line.getTotalLength(),
      tip = line.getPointAtLength(length),
      before = line.getPointAtLength(length - 24);
    assert(
      Math.abs(tip.x - before.x) < 0.01 && tip.y - before.y > 23.9,
      "North arrow has no visible vertical arrival",
    );
    line.parentElement
      .querySelector(".canvas-connection-hit")
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wait(30);
    for (const action of ["缩小画布", "缩小画布", "放大画布", "重置为 100%"]) {
      button(action).click();
      await wait(30);
      assert(
        line.parentElement
          .querySelector(".canvas-connection-hit")
          .getAttribute("d") === path,
        "Camera zoom changed world-space routing",
      );
      const matrix = line.getScreenCTM(),
        end = tip.matrixTransform(matrix),
        leg = before.matrixTransform(matrix);
      assert(
        Math.abs(end.x - leg.x) < 0.01 && end.y - leg.y > 12,
        "Zoom hides or flips the terminal leg",
      );
    }
    return {
      report: {
        nearLevelResizeRouting: true,
        zoomInvariantConnectorRouting: true,
      },
    };
  }
  if (phase === "connector-resize-restore") {
    button("撤销画布修改").click();
    await wait(50);
    button("撤销画布修改").click();
    await wait(50);
    return;
  }
  if (phase === "tools-final") {
    button("选择工具").click();
    // Keyboard nudge is world-space and bypasses snapping; undo restores the exact layout.
    const p = card(expected.ids[0]);
    p.querySelector(".canvas-card-body").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    await until(() => document.querySelector("[data-shape-text]"));
    input(document.querySelector("[data-shape-text]"), "收集问题 · 可编辑");
    p.querySelector("[data-shape-text]").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await wait(30);
    const before = (await saved()).board.placements.find(
      (x) => x.id === expected.ids[0],
    );
    const view = document.querySelector(".canvas-viewport");
    view.focus();
    view.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
      }),
    );
    view.dispatchEvent(
      new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }),
    );
    await until(
      async () =>
        (await saved()).board.placements.find((x) => x.id === before.id).x ===
        before.x + 10,
    );
    button("撤销画布修改").click();
    await until(
      async () =>
        (await saved()).board.placements.find((x) => x.id === before.id).x ===
        before.x,
    );
    const movingConnection = (await saved()).board.connectors[1].id;
    const path = document
      .querySelector(
        `[data-connector="${movingConnection}"] .canvas-connection-line`,
      )
      .getAttribute("d");
    const d = await saved(),
      node = d.board.placements.find((x) => x.id === expected.ids[1]);
    node.y += 12;
    await applyDsl(d);
    await wait(50);
    assert(
      document.querySelectorAll("[data-connector]").length === 3,
      "Connections disappeared after geometry edit",
    );
    const connected = (await saved()).board.connectors[1];
    assert(
      connected.to.placement === node.id,
      "Connection no longer binds to placement",
    );
    assert(
      document
        .querySelector(
          `[data-connector="${movingConnection}"] .canvas-connection-line`,
        )
        .getAttribute("d") !== path,
      "Connection does not follow node geometry",
    );
    const final = await saved();
    assert(
      final.board.connectors.length === 3,
      "Unexpected connection deletion",
    );
    // Delete a bound node through the UI and undo the full relation change.
    card(expected.ids[1]).querySelector('[aria-label^="移出画布"]').click();
    await until(async () => (await saved()).board.connectors.length === 1);
    button("撤销画布修改").click();
    await until(async () => (await saved()).board.connectors.length === 3);
    button("选择工具").click();
    document
      .querySelector(".canvas-viewport")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    return {
      doc: await saved(),
      report: {
        fourCornerSelection: true,
        selectionControlsAboveContent: true,
        shapeSelectionBoundsMatch: true,
        directSelectionPortDrag: true,
        boundaryAnchorSnapping: true,
        segmentDragUndo: true,
        directionalCursors: true,
        dragAlignment: true,
        boundConnectors: true,
        editableConnectorStyles: true,
        retargetConnection: true,
        basicShapes: true,
        keyboardNudge: true,
        connectorCascadeUndo: true,
      },
    };
  }
  if (phase === "tools-restored") {
    const d = await saved();
    assert(
      JSON.stringify(d) === JSON.stringify(expected.doc),
      "Canvas tools did not persist",
    );
    await until(
      () => document.querySelectorAll("[data-connector]").length === 3,
    );
    assert(
      document.querySelectorAll(".shape-card").length === 3,
      "Shapes not restored",
    );
    return { toolsRestored: true };
  }
  if (phase === "resize-cancelled") {
    const doc = await saved();
    assert(
      JSON.stringify(doc) === JSON.stringify(expected.doc),
      "Cancelled resize changed document",
    );
    assert(
      Math.abs(card(expected.id).offsetHeight - expected.height) < 2,
      "Cancelled resize kept preview height",
    );
    return;
  }
  if (phase === "resize-locate") {
    const select = document.querySelector('[aria-label="选择体验样例"]');
    select.value = String(expected.index);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await until(() => card(expected.id).classList.contains("selected"));
    assert(
      card(expected.id).querySelectorAll("[data-resize]").length === 8,
      "Content type missing resize edges",
    );
    return;
  }
  if (phase === "resize-before") {
    const doc = await saved();
    const el = card(expected.id ?? "place.start");
    const rect = el
      .querySelector(`[data-resize="${expected.direction}"]`)
      .getBoundingClientRect();
    return {
      doc,
      id: el.dataset.placement,
      height: el.offsetHeight,
      camera: camera(),
      pointer: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    };
  }
  if (phase === "resize-after") {
    const { before, direction, dx, dy } = expected;
    const old = before.doc.board.placements.find((p) => p.id === before.id);
    try {
      await until(async () => (await saved()).revision > before.doc.revision);
    } catch (error) {
      throw Error(
        `Resize ${before.id} ${direction} did not commit: ${JSON.stringify({
          pointer: before.pointer,
          camera: before.camera,
          height: before.height,
          hit: document
            .elementFromPoint(before.pointer.x, before.pointer.y)
            ?.outerHTML.slice(0, 400),
          selected: cards()
            .filter((c) => c.classList.contains("selected"))
            .map((c) => c.dataset.placement),
        })}\n${error}`,
      );
    }
    const doc = await saved(),
      next = doc.board.placements.find((p) => p.id === before.id);
    const wx = dx / before.camera.zoom,
      wy = dy / before.camera.zoom;
    const west = direction.includes("w"),
      east = direction.includes("e"),
      north = direction.includes("n"),
      south = direction.includes("s");
    const wanted = {
      ...old,
      x: old.x + (west ? wx : 0),
      y: old.y + (north ? wy : 0),
      width: old.width + (west ? -wx : east ? wx : 0),
      ...(north || south
        ? { height: (old.height ?? before.height) + (north ? -wy : wy) }
        : {}),
    };
    for (const key of ["x", "y", "width", "height"]) {
      assert(
        wanted[key] === undefined
          ? next[key] === undefined
          : Math.abs(next[key] - wanted[key]) < 2,
        `Resize ${direction} lost ${key}: ${JSON.stringify({ next, wanted })}`,
      );
    }
    assert(
      JSON.stringify(doc.blocks) === JSON.stringify(before.doc.blocks) &&
        JSON.stringify(doc.assets) === JSON.stringify(before.doc.assets) &&
        JSON.stringify(doc.notes) === JSON.stringify(before.doc.notes),
      "Resize changed semantic content",
    );
    const el = card(before.id);
    if (next.height !== undefined)
      assert(
        Math.abs(el.offsetHeight - next.height) < 2,
        "Fixed height not reflected in renderer",
      );
    button("撤销画布修改").click();
    await until(
      async () =>
        JSON.stringify(
          (await saved()).board.placements.find((p) => p.id === before.id),
        ) === JSON.stringify(old),
    );
    button("重做画布修改").click();
    await until(
      async () =>
        JSON.stringify(
          (await saved()).board.placements.find((p) => p.id === before.id),
        ) === JSON.stringify(next),
    );
    button("撤销画布修改").click();
    await until(
      async () =>
        JSON.stringify(
          (await saved()).board.placements.find((p) => p.id === before.id),
        ) === JSON.stringify(old),
    );
    return;
  }
  if (phase === "inline-preview") {
    await until(() => card("examples.v1.place.markdown"));
    card("examples.v1.place.markdown")
      .querySelector('[aria-label^="编辑"]')
      .click();
    await until(() =>
      card("examples.v1.place.markdown").querySelector("[data-markdown]"),
    );
    assert(noDialog(), "Inline preview opened a dialog");
    return;
  }
  if (phase === "corrupt") {
    await until(() => document.querySelector(".canvas-load-error"));
    const raw = await new Promise((resolve, reject) => {
      const open = indexedDB.open("nomi.canvas.v1", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result,
          req = db
            .transaction("documents", "readonly")
            .objectStore("documents")
            .get(JSON.stringify(["local-device", "document.home"]));
        req.onsuccess = () => {
          resolve(req.result);
          db.close();
        };
      };
    });
    assert(
      raw.schema === "future-document-schema",
      "Corrupt document was overwritten by a seed",
    );
    return { corruptDocumentPreserved: true };
  }
  await until(
    () =>
      cards().length >= 3 &&
      document.querySelectorAll(".learning-plot path[data-series]").length >= 3,
  );
  await until(
    () =>
      document.querySelector(".canvas-save-status").textContent ===
      "已保存到本机",
  );
  if (phase === "ready") {
    assert(
      location.hash === "" || location.hash === "#/canvas",
      "Canvas is not the default route",
    );
    assert(
      !!document.querySelector(
        '.rail-destinations a[href="#/canvas"][aria-current="page"]',
      ),
      "Canvas navigation missing",
    );
    assert(
      getComputedStyle(document.querySelector(".sidebar")).display === "none",
      "Canvas has a stock sidebar",
    );
    assert(
      !!document.querySelector('[data-placement="place.questions"] .katex'),
      "Note LaTeX did not render",
    );
    await document.fonts.ready;
    return { camera: camera(), doc: await saved() };
  }
  if (phase === "dragged") {
    const d = await saved();
    assert(
      Math.abs(d.board.placements[0].x - expected.x) < 2,
      "Native drag did not use world coordinates",
    );
    assert(
      Math.abs(d.board.placements[0].y - expected.y) < 2,
      "Native vertical drag failed",
    );
    assert(
      d.blocks.find((b) => b.id === "text.start").source === expected.source,
      "Dragging changed content",
    );
    return;
  }
  if (phase === "restored") {
    const d = await saved();
    assert(d.title === "我的知识画布", "DSL did not survive reload");
    assert(
      JSON.stringify(d.board.placements) ===
        JSON.stringify(expected.doc.board.placements),
      "Layout did not survive reload",
    );
    assert(
      d.blocks
        .find((b) => b.id === expected.noteBlock)
        .source.includes("刷新后继续写"),
      "Long note did not survive reload",
    );
    await until(
      () =>
        document.querySelectorAll('.canvas-image img[src^="blob:"]').length ===
        2,
    );
    assert(
      Number(document.querySelector(".learning-slider input").value) === 1.2,
      "Per-block learning state did not survive reload",
    );
    assert(
      Math.abs(camera().zoom - expected.camera.zoom) < 1e-9,
      "Camera did not restore separately",
    );
    return { restored: true, imagesRestored: true, studyStateRestored: true };
  }
  if (phase === "examples-restored") {
    await until(
      () =>
        document.querySelectorAll('[aria-label="选择体验样例"] option')
          .length === 11,
    );
    const d = await saved();
    const mixed = d.board.placements.find(
      (p) => p.id === "examples.v1.place.mixed",
    );
    assert(
      typeof mixed.height === "number" &&
        Math.abs(card(mixed.id).offsetHeight - mixed.height) < 2,
      "Resized height did not survive reload",
    );
    assert(
      d.board.placements.filter((p) => p.id.startsWith("examples.v1."))
        .length === 11,
      "Sample placements did not restore",
    );
    await until(
      () =>
        document.querySelector('[data-placement="examples.v1.place.image"] img')
          ?.naturalWidth === 960,
    );
    return { examplesRestored: true, heightRestored: true };
  }
  if (phase === "examples") {
    const before = await saved();
    button("模板").click();
    await until(() => button("添加体验样例"));
    button("添加体验样例").click();
    await until(
      async () =>
        (await saved()).board.placements.length ===
        before.board.placements.length + 11,
    );
    await until(
      () =>
        document.querySelector('[data-placement="examples.v1.place.image"] img')
          ?.naturalWidth === 960,
    );
    const after = await saved();
    assert(
      after.assets.length === before.assets.length + 3,
      "Sample originals were not saved",
    );
    assert(
      JSON.stringify(after.blocks.slice(0, before.blocks.length)) ===
        JSON.stringify(before.blocks),
      "Samples overwrote existing notes",
    );
    assert(
      JSON.stringify(
        after.board.placements.slice(0, before.board.placements.length),
      ) === JSON.stringify(before.board.placements),
      "Samples moved existing work",
    );
    const math = card("examples.v1.place.math");
    assert(
      math.querySelectorAll(".katex-display").length === 3 &&
        !math.querySelector(".katex-error"),
      "Math examples did not render",
    );
    const rows = [...math.querySelectorAll("mtable")].map(
      (table) => table.querySelectorAll(":scope > mtr").length,
    );
    assert(
      rows.includes(2) && rows.includes(3),
      "Matrix or aligned formulas lost row breaks",
    );
    const pdf = await repo.asset("examples.v1.asset.pdf");
    assert(
      (await pdf.text()).startsWith("%PDF-1.4"),
      "PDF sample is not a real file",
    );
    const ids = [
      "markdown",
      "math",
      "image",
      "textfile",
      "pdf",
      "interactive",
      "mixed",
      "mirror",
      "rectangle",
      "diamond",
      "ellipse",
    ];
    for (const key of ids) {
      await until(() =>
        card("examples.v1.place." + key).classList.contains("selected"),
      );
      button("下一个样例").click();
      await wait(30);
    }
    assert(
      document.querySelector('[aria-label="选择体验样例"]').value === "0",
      "Sequential tour did not wrap",
    );
    const revision = (await saved()).revision;
    button("模板").click();
    await until(() => button("添加体验样例"));
    button("添加体验样例").click();
    await until(() => !document.querySelector(".canvas-tool-menu"));
    await wait(40);
    assert(
      (await saved()).revision === revision,
      "Repeat examples reset or duplicated contents",
    );
    assert(
      window.canvasFixture.requests === 0,
      "Examples fetched external resources",
    );
    return {
      exampleTypes: true,
      exampleOriginals: true,
      exampleMath: true,
      exampleTour: true,
      exampleIdempotent: true,
      existingWorkPreserved: true,
    };
  }
  // Verify zoom anchor at viewport center and pan independently of the document.
  const beforeZoom = camera(),
    view = document.querySelector(".canvas-viewport");
  const center = { x: view.clientWidth / 2, y: view.clientHeight / 2 };
  button("放大画布").click();
  await wait(50);
  const afterZoom = camera();
  assert(
    Math.abs(
      (center.x - beforeZoom.x) / beforeZoom.zoom -
        (center.x - afterZoom.x) / afterZoom.zoom,
    ) < 1e-7,
    "Zoom lost pointer anchor",
  );
  const cameraBeforeControl = JSON.stringify(camera()),
    layoutBeforeControl = JSON.stringify((await saved()).board.placements);
  const tempCard = card("place.temperature");
  tempCard.querySelector('[aria-label^="复制摆放"]').click();
  await until(
    () => document.querySelectorAll(".learning-slider input").length === 2,
  );
  const range = document.querySelector(".learning-slider input");
  input(range, "1.2");
  await wait(30);
  range.dispatchEvent(
    new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }),
  );
  await wait(30);
  await until(() =>
    [...document.querySelectorAll(".learning-slider input")].every(
      (r) => Number(r.value) === 1.2,
    ),
  );
  [...document.querySelectorAll('[data-content="interactive.temperature"]')]
    .at(-1)
    .querySelector('[aria-label^="移出画布"]')
    .click();
  await until(
    () => document.querySelectorAll(".learning-slider input").length === 1,
  );
  assert(
    JSON.stringify(camera()) === cameraBeforeControl,
    "Slider panned canvas",
  );
  assert(
    JSON.stringify((await saved()).board.placements) === layoutBeforeControl,
    "Slider moved placement",
  );
  button("新建笔记").click();
  await until(() => !!document.querySelector("[data-markdown]"));
  const editor = document.querySelector("[data-markdown]"),
    noteBlock = editor.dataset.markdown,
    newCard = editor.closest("[data-placement]"),
    noteId = newCard.dataset.content;
  assert(
    newCard.querySelector('[aria-label="笔记标题"]').value === "",
    "New text requires a title",
  );
  assert(
    newCard.querySelectorAll('[aria-label="笔记标题"]').length === 1 &&
      newCard.querySelector('.canvas-card-header [aria-label="笔记标题"]'),
    "Title is duplicated outside header",
  );
  input(newCard.querySelector('[aria-label="笔记标题"]'), "画布中的长笔记");
  await wait(30);
  input(newCard.querySelector('[aria-label="笔记标题"]'), "");
  await until(
    async () => (await saved()).notes.find((n) => n.id === noteId).title === "",
  );
  assert(
    newCard.classList.contains("is-untitled"),
    "Cleared title still shown as required",
  );
  input(newCard.querySelector('[aria-label="笔记标题"]'), "画布中的长笔记");
  await wait(30);
  const source =
    "## 刷新后继续写\n\n**Markdown** 与 $E=mc^2$ 在同一篇笔记里。\n\n" +
    "长篇内容，保持完整原文。\n\n".repeat(150);
  input(editor, source);
  await wait(30);
  newCard.querySelector(".canvas-card-actions button").click();
  await wait(50);
  assert(
    !!newCard.querySelector(".canvas-markdown .katex"),
    "Edited Markdown/LaTeX preview missing",
  );
  const inlineCamera = JSON.stringify(camera()),
    inlineLayout = JSON.stringify((await saved()).board.placements);
  const doubleClickNote = () =>
    newCard
      .querySelector(".canvas-markdown")
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
  doubleClickNote();
  await until(() => newCard.querySelector("[data-markdown]"));
  assert(noDialog(), "Double-click opened a modal instead of inline editing");
  assert(
    document.activeElement === newCard.querySelector("[data-markdown]"),
    "Inline source was not focused",
  );
  const updatedSource = source + "\n\n原位修改保持到放大视图。";
  input(newCard.querySelector("[data-markdown]"), updatedSource);
  await wait(30);
  newCard.querySelector('[aria-label="笔记标题"]').focus();
  newCard.querySelector("[data-markdown]").dispatchEvent(
    new FocusEvent("focusout", {
      bubbles: true,
      relatedTarget: newCard.querySelector('[aria-label="笔记标题"]'),
    }),
  );
  await wait(30);
  assert(
    newCard.querySelector("[data-markdown]"),
    "Internal focus ended editing",
  );
  button("选择工具").dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true }),
  );
  await wait(60);
  assert(
    !newCard.querySelector("[data-markdown]"),
    "Outside pointer did not finish inline editing",
  );
  assert(
    newCard.textContent.includes("原位修改保持"),
    "Outside click lost edits",
  );
  doubleClickNote();
  await until(() => newCard.querySelector("[data-markdown]"));
  newCard.querySelector('[aria-label^="完成编辑"]').click();
  await wait(60);
  assert(
    !newCard.querySelector("[data-markdown]"),
    "Done did not finish inline editing",
  );
  doubleClickNote();
  await until(() => newCard.querySelector("[data-markdown]"));
  // The headless Electron window updates activeElement without native focus events.
  // Dispatch the browser focusout boundary used by React when Tab leaves a card.
  newCard.querySelector("[data-markdown]").dispatchEvent(
    new FocusEvent("focusout", {
      bubbles: true,
      relatedTarget: button("选择工具"),
    }),
  );
  await wait(60);
  assert(
    !newCard.querySelector("[data-markdown]"),
    "Keyboard focus did not finish inline editing",
  );
  doubleClickNote();
  await until(() => newCard.querySelector("[data-markdown]"));
  assert(
    JSON.stringify(camera()) === inlineCamera &&
      JSON.stringify((await saved()).board.placements) === inlineLayout,
    "Editing changed world geometry",
  );
  newCard.querySelector('[aria-label^="聚焦"]').click();
  await until(() => document.querySelector(".canvas-focus-modal"));
  const focused = document.querySelector(".canvas-focus-modal [data-markdown]");
  assert(
    document.querySelectorAll('.canvas-focus-modal [aria-label="笔记标题"]')
      .length === 1 &&
      document.querySelector(
        '.canvas-focus-modal .dialog-header [aria-label="笔记标题"]',
      ),
    "Expanded note duplicates title outside header",
  );
  assert(focused.value === updatedSource, "Expand lost inline note source");
  assert(
    !newCard.querySelector("[data-markdown]"),
    "Expand left a hidden inline editor",
  );
  input(focused, source);
  await wait(30);
  assert(
    document.querySelector(".canvas-focus-preview .katex"),
    "Expanded editor lost live math preview",
  );
  // Paste a synthetic original image into the focused note; files on background stay independent.
  const image = await new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 32;
    c.getContext("2d").fillRect(0, 0, 48, 32);
    c.toBlob(resolve, "image/png");
  });
  const transfer = new DataTransfer();
  transfer.items.add(new File([image], "pasted.png", { type: "image/png" }));
  focused.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    }),
  );
  await until(async () => (await saved()).assets.length === 1);
  const close =
    document.querySelector(
      '.canvas-focus-modal button[aria-label="Close dialog"]',
    ) ||
    document.querySelector('.canvas-focus-modal button[aria-label="Close"]');
  assert(close, "Focus close missing");
  close.click();
  await until(noDialog);
  const files = new DataTransfer();
  files.items.add(new File([image], "figure.png", { type: "image/png" }));
  files.items.add(
    new File(["reference original"], "reference.txt", { type: "text/plain" }),
  );
  const picker = document.querySelector('[aria-label="选择画布附件"]');
  picker.files = files.files;
  picker.dispatchEvent(new Event("change", { bubbles: true }));
  await until(async () => (await saved()).assets.length === 3);
  await until(
    () =>
      document.querySelectorAll('.canvas-image img[src^="blob:"]').length === 2,
  );
  assert(
    document.querySelector(".asset-text-preview a[download]").download ===
      "reference.txt",
    "Original file download missing",
  );
  // A failed attachment transaction must remain redoable after undoing it.
  window.canvasFixture.failWrites = true;
  const pendingFile = new DataTransfer();
  pendingFile.items.add(
    new File(["pending original"], "pending.txt", { type: "text/plain" }),
  );
  picker.files = pendingFile.files;
  picker.dispatchEvent(new Event("change", { bubbles: true }));
  await until(
    () =>
      document.querySelector(".canvas-save-status").textContent === "尚未保存",
  );
  assert(
    (await saved()).assets.length === 3,
    "Failed transaction committed an asset reference",
  );
  window.canvasFixture.failWrites = false;
  button("撤销画布修改").click();
  await until(
    () =>
      document.querySelector(".canvas-save-status").textContent ===
      "已保存到本机",
  );
  button("重做画布修改").click();
  await until(async () => (await saved()).assets.length === 4);
  const dBefore = await saved();
  const copyButton = document.querySelector(
    `[data-content="${noteId}"] [aria-label^="复制摆放"]`,
  );
  copyButton.click();
  await until(
    () => document.querySelectorAll(`[data-content="${noteId}"]`).length === 2,
  );
  assert(
    (await saved()).blocks.length === dBefore.blocks.length,
    "Duplicate placement copied content",
  );
  const copied = [
    ...document.querySelectorAll(`[data-content="${noteId}"]`),
  ].at(-1);
  copied.querySelector('[aria-label^="移出画布"]').click();
  await until(
    () => document.querySelectorAll(`[data-content="${noteId}"]`).length === 1,
  );
  button("撤销画布修改").click();
  await until(
    () => document.querySelectorAll(`[data-content="${noteId}"]`).length === 2,
  );
  button("重做画布修改").click();
  await until(
    () => document.querySelectorAll(`[data-content="${noteId}"]`).length === 1,
  );
  // Strict DSL edit cannot install broken input, and compatible study state remains.
  button("编辑文档 DSL").click();
  await until(() => document.querySelector('[aria-label="文档 DSL 源码"]'));
  const dsl = document.querySelector('[aria-label="文档 DSL 源码"]'),
    good = dsl.value;
  input(dsl, "{broken");
  await wait(25);
  [...document.querySelectorAll(".canvas-dsl-modal button")]
    .find((b) => b.textContent === "校验并应用")
    .click();
  await wait(25);
  assert(
    !!document.querySelector(".canvas-dsl-error"),
    "Invalid DSL was accepted",
  );
  assert(
    (await saved()).title === "我的画布",
    "Broken DSL replaced good document",
  );
  const next = JSON.parse(good);
  next.title = "我的知识画布";
  input(dsl, JSON.stringify(next));
  await wait(25);
  [...document.querySelectorAll(".canvas-dsl-modal button")]
    .find((b) => b.textContent === "校验并应用")
    .click();
  await until(noDialog);
  await until(async () => (await saved()).title === "我的知识画布");
  assert(
    Number(document.querySelector(".learning-slider input").value) === 1.2,
    "Document edit reset study state",
  );
  // Quota error stays visible; retry persists the same in-memory edit.
  window.canvasFixture.failWrites = true;
  const existing = document.querySelector(`[data-content="${noteId}"]`);
  existing.querySelector('[aria-label^="编辑"]').click();
  await until(() => existing.querySelector("[data-markdown]"));
  input(existing.querySelector("[data-markdown]"), source + "\n恢复保存");
  await until(
    () =>
      document.querySelector(".canvas-save-status").textContent === "尚未保存",
  );
  window.canvasFixture.failWrites = false;
  [...document.querySelectorAll(".canvas-message button")]
    .find((b) => b.textContent === "重试保存")
    .click();
  await until(
    () =>
      document.querySelector(".canvas-save-status").textContent ===
      "已保存到本机",
  );
  existing.querySelector(".canvas-card-actions button").click();
  await wait(25);
  const final = await saved();
  assert(
    final.blocks.find((b) => b.id === noteBlock).source.endsWith("恢复保存"),
    "Save retry lost pending text",
  );
  assert(
    (await window.canvasFixture.repository("other-profile").load()) ===
      undefined,
    "Local profile data leaked",
  );
  let conflict = false;
  try {
    await repo.save(
      { ...final, revision: final.revision + 1 },
      [],
      final.revision - 1,
    );
  } catch {
    conflict = true;
  }
  assert(conflict, "Stale writer overwrote document");
  assert(
    (await saved()).revision === final.revision,
    "Conflict mutated saved document",
  );
  assert(
    window.canvasFixture.requests === 0,
    "Canvas issued a network request",
  );
  return {
    doc: final,
    noteBlock,
    camera: camera(),
    report: {
      defaultCanvas: true,
      worldDrag: true,
      anchoredZoom: true,
      controlsIsolated: true,
      longNotes: true,
      markdownLatex: true,
      focusEditing: true,
      doubleClickInline: true,
      outsideClickRenders: true,
      explicitDone: true,
      keyboardBlurRenders: true,
      expandPreservesEdits: true,
      optionalHeaderTitle: true,
      eightDirectionResize: true,
      pasteImageIntoNote: true,
      originalFiles: true,
      sharedPlacement: true,
      sharedStudyState: true,
      worldResize: true,
      pan: true,
      undoRedo: true,
      strictDsl: true,
      quotaRecovery: true,
      pendingAttachmentUndoRedo: true,
      profileIsolation: true,
      staleWriterRejected: true,
      zeroNetwork: true,
    },
  };
}
const main = `const {app,BrowserWindow}=require('electron');const {join}=require('node:path');const {writeFileSync}=require('node:fs');app.setPath('userData',join(${JSON.stringify(output)},'profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
const run=(phase,expected)=>win.webContents.executeJavaScript('('+${JSON.stringify(checks.toString())}+')('+JSON.stringify(phase)+','+JSON.stringify(expected||null)+')').catch(error=>{throw new Error(phase+': '+error.message);});
const parity=(phase,expected)=>win.webContents.executeJavaScript('('+${JSON.stringify(canvasParityChecks.toString())}+')('+JSON.stringify(phase)+','+JSON.stringify(expected||null)+')');
try{await win.loadFile(join(${JSON.stringify(output)},'index.html'));const initial=await run('ready');await run('arrow-tip-check');writeFileSync(join(${JSON.stringify(output)},'canvas-desktop.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'canvas-dark.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");
const position=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('[data-placement=\\\"place.start\\\"] .canvas-card-header .canvas-card-kind').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
win.webContents.sendInputEvent({type:'mouseMove',modifiers:['alt'],x:Math.round(position.x),y:Math.round(position.y)});win.webContents.sendInputEvent({type:'mouseDown',modifiers:['alt'],button:'left',clickCount:1,x:Math.round(position.x),y:Math.round(position.y)});win.webContents.sendInputEvent({type:'mouseMove',modifiers:['alt'],x:Math.round(position.x+64),y:Math.round(position.y+40)});await new Promise(r=>setTimeout(r,60));win.webContents.sendInputEvent({type:'mouseUp',modifiers:['alt'],button:'left',clickCount:1,x:Math.round(position.x+64),y:Math.round(position.y+40)});await new Promise(r=>setTimeout(r,100));await run('dragged',{x:64/initial.camera.zoom,y:40/initial.camera.zoom,source:initial.doc.blocks.find(b=>b.id==='text.start').source});
const drag=async(pos,dx,dy,afterDown,beforeUp)=>{const x=Math.round(pos.x),y=Math.round(pos.y);win.webContents.sendInputEvent({type:'mouseMove',x,y});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x,y});if(afterDown)await afterDown();win.webContents.sendInputEvent({type:'mouseMove',x:x+dx,y:y+dy});await new Promise(r=>setTimeout(r,60));if(beforeUp)await beforeUp();win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:x+dx,y:y+dy});await new Promise(r=>setTimeout(r,100));};
for(const direction of ['n','ne','e','se','s','sw','w','nw']) {
  const before=await run('resize-before',{direction});
  const dx=direction.includes('e')||direction.includes('w')?24:0;
  const dy=direction.includes('n')||direction.includes('s')?18:0;
  await drag(before.pointer,dx,dy);await run('resize-after',{before,direction,dx,dy});
}
const cancelled=await run('resize-before',{direction:'nw'});
win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:Math.round(cancelled.pointer.x),y:Math.round(cancelled.pointer.y)});
win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(cancelled.pointer.x+30),y:Math.round(cancelled.pointer.y+20)});
await new Promise(r=>setTimeout(r,50));win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:Math.round(cancelled.pointer.x+30),y:Math.round(cancelled.pointer.y+20)});await new Promise(r=>setTimeout(r,70));await run('resize-cancelled',cancelled);
const blank=await win.webContents.executeJavaScript("(()=>{const v=document.querySelector('.canvas-viewport'),r=v.getBoundingClientRect();return {x:r.right-30,y:r.y+r.height/2,camera:JSON.parse(v.dataset.camera)}})()");win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});await drag(blank,48,-24);win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});const pan=await win.webContents.executeJavaScript("JSON.parse(document.querySelector('.canvas-viewport').dataset.camera)");if(Math.abs(pan.x-blank.camera.x-48)>1||Math.abs(pan.y-blank.camera.y+24)>1)throw Error('Space-drag pan failed');
const expected=await run('edit');await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});Object.assign(expected.report,await run('restored',expected));
Object.assign(expected.report,await run('examples'));
for(const [index,key] of [[2,'image'],[4,'pdf'],[5,'interactive'],[6,'mixed']]) {
  const id='examples.v1.place.'+key;await run('resize-locate',{id,index});
  const before=await run('resize-before',{id,direction:'s'});await drag(before.pointer,0,20);await run('resize-after',{before,direction:'s',dx:0,dy:20});
}
await win.webContents.executeJavaScript(${JSON.stringify(`document.querySelector('[aria-label="重做画布修改"]').click()`)});await new Promise(r=>setTimeout(r,80));
await run('resize-locate',{id:'examples.v1.place.markdown',index:0});
writeFileSync(join(${JSON.stringify(output)},'canvas-examples.png'),(await win.webContents.capturePage()).toPNG());await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});Object.assign(expected.report,await run('examples-restored'));
await run('inline-preview');writeFileSync(join(${JSON.stringify(output)},'canvas-inline-edit.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript(${JSON.stringify(`document.querySelector('[aria-label^="完成编辑"]').click()`)});
const tools=await run('tools-setup');
const start={x:Math.round(tools.pointer.x),y:Math.round(tools.pointer.y)};
win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:start.x,y:start.y});
win.webContents.sendInputEvent({type:'mouseMove',x:start.x+3,y:Math.round(start.y-60*tools.camera.zoom)});
await new Promise(r=>setTimeout(r,80));await run('tools-snapping',tools);writeFileSync(join(${JSON.stringify(output)},'canvas-alignment.png'),(await win.webContents.capturePage()).toPNG());
win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:start.x+3,y:Math.round(start.y-60*tools.camera.zoom)});await new Promise(r=>setTimeout(r,70));
let body=await run('tools-body',{id:tools.ids[0]});
win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:2,x:Math.round(body.pointer.x),y:Math.round(body.pointer.y)});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:2,x:Math.round(body.pointer.x),y:Math.round(body.pointer.y)});await run('tools-doubled',{id:tools.ids[0]});
for(const mode of ['alt','shift']) {
 body=await run('tools-body',{id:tools.ids[0]});const x=Math.round(body.pointer.x),y=Math.round(body.pointer.y),dx=mode==='alt'?4:20,dy=30;
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',x,y,modifiers:[mode]});win.webContents.sendInputEvent({type:'mouseMove',x:x+dx,y:y+dy,modifiers:[mode]});await new Promise(r=>setTimeout(r,60));win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:x+dx,y:y+dy,modifiers:[mode]});await run('tools-motion-check',{before:body,dx:mode==='alt'?4:0,dy});
}
let ports=await run('tools-port',{from:'place.start',fromSide:'e',to:'place.questions',toSide:'w',direct:true});await drag(ports.from,ports.to.x-ports.from.x,ports.to.y-ports.from.y,()=>run('tools-connecting',{to:'place.questions'}),async()=>{await run('tools-target-snapped',{id:'place.questions',side:'w'});writeFileSync(join(${JSON.stringify(output)},'canvas-connector-snapping.png'),(await win.webContents.capturePage()).toPNG());});
const firstConnection=await run('tools-connected',{count:ports.count,label:'连接想法',style:'dashed',arrows:'both'});
const retarget=await run('tools-target',{id:tools.ids[0]});await drag(firstConnection.pointer,retarget.x-firstConnection.pointer.x,retarget.y-firstConnection.pointer.y);await run('tools-retargeted',{id:tools.ids[0]});
for(const [from,to,label,routing] of [[tools.ids[0],tools.ids[1],'组织','elbow'],[tools.ids[1],tools.ids[2],'探索','curve']]) {
 ports=await run('tools-port',{from,fromSide:'e',to,toSide:'w'});await drag(ports.from,ports.to.x-ports.from.x,ports.to.y-ports.from.y);await run('tools-connected',{count:ports.count,label,routing});
}
const toolbarResult=await run('toolbar-details');Object.assign(expected.report,toolbarResult.report);writeFileSync(join(${JSON.stringify(output)},'canvas-connector-toolbar.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'canvas-connector-toolbar-dark.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");await win.webContents.executeJavaScript(${JSON.stringify(`document.querySelector('[aria-label="线条设置"]').click()`)});
const segment=await run('toolbar-segment-before',{id:toolbarResult.id});await drag(segment.pointer,segment.dx,segment.dy);await run('toolbar-segment-after',segment);
await run('toolbar-upward-route',{id:tools.ids[1]});writeFileSync(join(${JSON.stringify(output)},'canvas-upward-route.png'),(await win.webContents.capturePage()).toPNG());await run('toolbar-upward-restore');
const nearLevel=await run('connector-resize-setup',{id:tools.ids[1]});await drag(nearLevel.pointer,0,-40);const nearLevelResult=await run('connector-resize-check',nearLevel);Object.assign(expected.report,nearLevelResult.report);writeFileSync(join(${JSON.stringify(output)},'canvas-near-level-resize.png'),(await win.webContents.capturePage()).toPNG());await run('connector-resize-restore');
const toolsResult=await run('tools-final',tools);Object.assign(expected.report,toolsResult.report);await run('tools-select-rectangle',{id:tools.ids[0]});writeFileSync(join(${JSON.stringify(output)},'canvas-rectangle-bounds.png'),(await win.webContents.capturePage()).toPNG());win.webContents.sendInputEvent({type:'mouseMove',x:1200,y:800});await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'canvas-connections.png'),(await win.webContents.capturePage()).toPNG());
await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'canvas-connections-dark.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");
await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});Object.assign(expected.report,await run('tools-restored',toolsResult));
for(const [end,routing,style] of [['from','rounded','solid'],['to','straight','dashed'],['from','curve','dotted'],['to','elbow','solid']]) {
 const endpoint=await run('endpoint-setup',{end,routing,style});await drag(endpoint.pointer,endpoint.dx,endpoint.dy,()=>run('endpoint-pressed',endpoint),async()=>{await run('endpoint-live',endpoint);if(end==='from'&&routing==='rounded')writeFileSync(join(${JSON.stringify(output)},'canvas-endpoint-drag.png'),(await win.webContents.capturePage()).toPNG());});await run('endpoint-committed',endpoint);
}
const cancelledEndpoint=await run('endpoint-setup',{end:'to',routing:'rounded',style:'solid'});await drag(cancelledEndpoint.pointer,cancelledEndpoint.dx,cancelledEndpoint.dy,()=>run('endpoint-pressed',cancelledEndpoint),async()=>{await run('endpoint-live',cancelledEndpoint);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});});await run('endpoint-cancelled',cancelledEndpoint);for(const end of ['from','to','new']) for(const mode of ['lane','heading','snap-edge','snap-midline','edge-top','edge-left','edge-diamond','edge-ellipse','edge-round','self-bottom','self-same','self-opposite','self-port']) {
 const jitter=await run('endpoint-jitter-setup',{end,mode});
 win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(jitter.pointer.x),y:Math.round(jitter.pointer.y)});
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:Math.round(jitter.pointer.x),y:Math.round(jitter.pointer.y)});
 if(jitter.arm){win.webContents.sendInputEvent({type:'mouseMove',x:jitter.arm.x,y:jitter.arm.y});await new Promise(r=>setTimeout(r,25));}
 for(const p of jitter.samples){win.webContents.sendInputEvent({type:'mouseMove',x:p.x,y:p.y});await run('endpoint-jitter-check',jitter);}
 if(end==='to'&&mode==='lane') writeFileSync(join(${JSON.stringify(output)},'canvas-endpoint-stable.png'),(await win.webContents.capturePage()).toPNG());
 if(end==='to'&&mode==='self-bottom') writeFileSync(join(${JSON.stringify(output)},'canvas-self-loop.png'),(await win.webContents.capturePage()).toPNG());
 if(end==='to'&&mode==='edge-diamond') writeFileSync(join(${JSON.stringify(output)},'canvas-boundary-snapping.png'),(await win.webContents.capturePage()).toPNG());
 const last=jitter.samples.at(-1);win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:last.x,y:last.y});const persisted=await run('endpoint-jitter-done',{...jitter,persist:end==='to'&&(mode==='edge-diamond'||mode==='self-bottom')});
 if(persisted){await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});await run('boundary-restored',persisted);if(mode==='self-bottom'){await run('end-clearance-check',persisted);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await new Promise(r=>setTimeout(r,30));writeFileSync(join(${JSON.stringify(output)},'canvas-end-clearance.png'),(await win.webContents.capturePage()).toPNG());}}
}
expected.report.endpointJitterStable=true;expected.report.endInkClearance=true;expected.report.arrowTipRaster=true;expected.report.selfLoopBindings=true;expected.report.continuousBoundaryBinding=true;expected.report.boundaryMoveResizeRestore=true;Object.assign(expected.report,await run('endpoint-restore'));
win.setSize(390,900);await new Promise(r=>setTimeout(r,150));const mobile=await win.webContents.executeJavaScript("!!document.querySelector('.canvas-workspace')&&document.documentElement.scrollWidth===innerWidth&&document.querySelector('.canvas-toolbar').getBoundingClientRect().right<=innerWidth");if(!mobile)throw Error('Canvas mobile toolbar overflow');writeFileSync(join(${JSON.stringify(output)},'canvas-narrow.png'),(await win.webContents.capturePage()).toPNG());await run('toolbar-narrow');await new Promise(r=>setTimeout(r,60));writeFileSync(join(${JSON.stringify(output)},'canvas-connector-toolbar-narrow.png'),(await win.webContents.capturePage()).toPNG());
win.setSize(1440,1000);await new Promise(r=>setTimeout(r,80));
const shapeParity=await parity('setup');await drag(shapeParity.pointer,0,0);Object.assign(expected.report,await parity('menus'));writeFileSync(join(${JSON.stringify(output)},'canvas-shape-toolbar.png'),(await win.webContents.capturePage()).toPNG());
await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");await new Promise(r=>setTimeout(r,60));writeFileSync(join(${JSON.stringify(output)},'canvas-shape-toolbar-dark.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");
const marquee=await parity('marquee-setup');await drag(marquee.pointer,Math.round(marquee.dx),Math.round(marquee.dy));Object.assign(expected.report,await parity('marquee-check',marquee));const multi=await parity('multi');writeFileSync(join(${JSON.stringify(output)},'canvas-selection-export.png'),Buffer.from(await parity('png-export')));writeFileSync(join(${JSON.stringify(output)},'canvas-multi-selection.png'),(await win.webContents.capturePage()).toPNG());
win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:Math.round(multi.pointer.x),y:Math.round(multi.pointer.y),modifiers:['alt']});win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(multi.pointer.x+24),y:Math.round(multi.pointer.y+18),modifiers:['alt']});await new Promise(r=>setTimeout(r,50));win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:Math.round(multi.pointer.x+24),y:Math.round(multi.pointer.y+18),modifiers:['alt']});const groupResize=await parity('moved',multi);await drag(groupResize.pointer,30,0);Object.assign(expected.report,await parity('resized',groupResize));
const gap=await parity('gap-setup');await drag(gap.pointer,Math.round(-34*gap.zoom),0,null,async()=>{await parity('gap-check');writeFileSync(join(${JSON.stringify(output)},'canvas-equal-gap.png'),(await win.webContents.capturePage()).toPNG());});
const size=await parity('size-setup');await drag(size.pointer,Math.round(-10*size.zoom),0,null,async()=>{await parity('size-check');writeFileSync(join(${JSON.stringify(output)},'canvas-same-size.png'),(await win.webContents.capturePage()).toPNG());});
win.setSize(390,900);await new Promise(r=>setTimeout(r,80));await parity('narrow');writeFileSync(join(${JSON.stringify(output)},'canvas-shape-toolbar-narrow.png'),(await win.webContents.capturePage()).toPNG());Object.assign(expected.report,await parity('restore'));
await win.webContents.executeJavaScript(${JSON.stringify(`(async()=>{const db=await new Promise((resolve,reject)=>{const open=indexedDB.open('nomi.canvas.v1',1);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents'),key=JSON.stringify(['local-device','document.home']),get=store.get(key);get.onsuccess=()=>store.put({...get.result,schema:'future-document-schema'},key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();})()`)});await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});Object.assign(expected.report,await run('corrupt'));
writeFileSync(join(${JSON.stringify(output)},'report.json'),JSON.stringify({...expected.report,narrowNoOverflow:true},null,2));console.log(JSON.stringify(expected.report));app.exit(0);}catch(error){writeFileSync(join(${JSON.stringify(reports)},'canvas-failed.png'),(await win.webContents.capturePage()).toPNG());console.error(error);console.error(await win.webContents.executeJavaScript('document.body.innerText.slice(-1500)'));app.exit(1);}});setTimeout(()=>app.exit(1),150000);`;
await writeFile(join(output, "main.cjs"), main);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  cwd: root,
  env,
  stdio: "inherit",
});
const timer = setTimeout(() => child.kill("SIGKILL"), 115000);
const code = await new Promise((resolve) =>
  child.once("exit", (code) => resolve(code ?? 1)),
);
clearTimeout(timer);
await rm(join(output, "profile"), { recursive: true, force: true });
if (code === 0) {
  for (const file of [
    "report.json",
    "canvas-shape-toolbar.png",
    "canvas-shape-toolbar-dark.png",
    "canvas-multi-selection.png",
    "canvas-selection-export.png",
    "canvas-equal-gap.png",
    "canvas-same-size.png",
    "canvas-shape-toolbar-narrow.png",
    "canvas-desktop.png",
    "canvas-endpoint-drag.png",
    "canvas-endpoint-stable.png",
    "canvas-boundary-snapping.png",
    "canvas-self-loop.png",
    "canvas-end-clearance.png",
    "canvas-dark.png",
    "canvas-narrow.png",
    "canvas-examples.png",
    "canvas-inline-edit.png",
    "canvas-alignment.png",
    "canvas-rectangle-bounds.png",
    "canvas-upward-route.png",
    "canvas-near-level-resize.png",
    "canvas-connector-toolbar.png",
    "canvas-connector-toolbar-dark.png",
    "canvas-connector-toolbar-narrow.png",
    "canvas-connector-snapping.png",
    "canvas-connections.png",
    "canvas-connections-dark.png",
  ])
    await copyFile(join(output, file), join(reports, file));
  await rm(output, { recursive: true, force: true });
}
process.exitCode = code;
