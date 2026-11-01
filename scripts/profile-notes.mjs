import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/notes-performance");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(
  join(reports, (process.env.NOMI_PERF_LABEL || "run") + "-"),
);
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/notes-performance.tsx"],
  outfile: join(output, "renderer.js"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  conditions: ["style", "browser"],
  define: { "process.env.NODE_ENV": '"production"' },
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
  '<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><body><div id="root"></div><script type="module" src="renderer.js"></script></body></html>',
);
await build({
  absWorkingDir: root,
  entryPoints: ["packages/host/src/document-store.ts"],
  outfile: join(output, "store.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "warning",
});
async function benchmark(output, keepOpen) {
  const { app, BrowserWindow } = require("electron"),
    { writeFileSync } = require("node:fs"),
    { join } = require("node:path"),
    os = require("node:os");
  app.commandLine.appendSwitch("enable-precise-memory-info");
  app.setPath("userData", join(output, "profile"));
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1360,
    height: 1000,
    show: true,
    title: "Nomi · 独立性能测试",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const run = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg)})`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn) => {
    for (let i = 0; i < 500; i++) {
      if (await run(fn)) return;
      await wait(40);
    }
    throw Error("Timed out: " + fn);
  };
  const stats = (xs) => {
    const a = [...xs].sort((a, b) => a - b);
    return {
      count: a.length,
      p50: a[Math.floor(a.length * 0.5)],
      p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))],
      max: a.at(-1),
    };
  };
  try {
    await win.loadFile(join(output, "index.html"), {
      hash: "/notes?note=perf.long",
    });
    await until(() => !!document.querySelector(".tiptap")?.editor);
    await until(
      () =>
        document.querySelector(".notes-save")?.dataset.saveState === "saved",
    );
    win.webContents.debugger.attach("1.3");
    const report = {
      environment: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0].model,
        production: true,
        viewport: [1360, 1000],
      },
      scenarios: [],
    };
    for (const id of ["perf.long", "perf.mixed"]) {
      await run(() => {
        location.hash = "/canvas";
      });
      await until(() => !document.querySelector(".tiptap"));
      const started = Date.now();
      await run((id) => {
        location.hash = "/notes?note=" + id;
      }, id);
      await until(() => !!document.querySelector(".tiptap")?.editor);
      await run(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const openMs = Date.now() - started;
      await run(() => {
        window.perfTasks = [];
        window.perfObserver = new PerformanceObserver((list) => {
          window.perfTasks.push(...list.getEntries().map((e) => e.duration));
        });
        window.perfObserver.observe({ type: "longtask" });
        window.perfInput = [];
        const el = document.querySelector(".tiptap");
        window.perfEditor = el.editor;
        window.perfOriginal = el.editor.getMarkdown();
        el.addEventListener("beforeinput", () => {
          const t = performance.now();
          requestAnimationFrame(() =>
            window.perfInput.push(performance.now() - t),
          );
        });
        el.editor.commands.focus("start");
      });
      await win.webContents.debugger.sendCommand("Profiler.enable");
      await win.webContents.debugger.sendCommand("Profiler.start");
      for (const c of "performance1234567890") {
        await win.webContents.debugger.sendCommand("Input.insertText", {
          text: c,
        });
        await run(
          () =>
            new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            ),
        );
      }
      const { profile } =
        await win.webContents.debugger.sendCommand("Profiler.stop");
      writeFileSync(join(output, id + ".cpuprofile"), JSON.stringify(profile));
      const scroll = await run(async () => {
        const pane = document.querySelector(".notes-scroll"),
          times = [];
        for (let i = 0; i < 30; i++) {
          const t = performance.now();
          pane.scrollTop = ((pane.scrollHeight - pane.clientHeight) * i) / 29;
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
          times.push(performance.now() - t);
        }
        pane.scrollTop = 0;
        return times;
      });
      const saveStart = Date.now();
      await run(() => document.activeElement?.blur());
      await until(
        () =>
          document.querySelector(".notes-save")?.dataset.saveState === "saved",
      );
      const data = await run(async (id) => {
        window.perfObserver.disconnect();
        const doc = await window.canvasFixture
          .repository("local-device")
          .load();
        const note = doc.notes.find((n) => n.id === id);
        return {
          input: window.perfInput,
          longTasks: window.perfTasks,
          domNodes: document.querySelectorAll("*").length,
          editors: document.querySelectorAll(".tiptap").length,
          heapMB: performance.memory.usedJSHeapSize / 1048576,
          noteBlocks: note.blocks.length,
          characters: note.blocks.reduce(
            (sum, id) =>
              sum + (doc.blocks.find((b) => b.id === id)?.source?.length || 0),
            0,
          ),
          savedSource:
            doc.blocks.find((b) => b.id === note.blocks[0]).source ===
            window.perfEditor.getMarkdown(),
        };
      }, id);
      if (!data.savedSource)
        throw Error("Saved Markdown differs from the complete edited source");
      const undoRedo = await run(() => {
        const editor = window.perfEditor,
          typed = editor.getMarkdown();
        editor.commands.undo();
        const undone = editor.getMarkdown() === window.perfOriginal;
        editor.commands.redo();
        return undone && editor.getMarkdown() === typed;
      });
      if (!undoRedo) throw Error("Long document undo/redo changed content");
      const sample = {
        id,
        openMs,
        inputToFrame: stats(data.input),
        scrollTwoFrames: stats(scroll),
        saveDrainMs: Date.now() - saveStart,
        ...data,
      };
      report.scenarios.push(sample);
      console.log(JSON.stringify(sample));
      writeFileSync(
        join(output, id + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    }
    // Bare entry + reload must retain exact saved content.
    await run(() => {
      location.hash = "/notes";
    });
    await wait(100);
    await new Promise((r) => {
      win.webContents.once("did-finish-load", r);
      win.reload();
    });
    await until(() => !!document.querySelector(".tiptap")?.editor);
    if (
      !(await run(() =>
        document
          .querySelector(".tiptap")
          .textContent.startsWith("performance1234567890"),
      ))
    )
      throw Error("Reload lost typed content");
    report.reloadVerified = true;
    // Real .nomi package I/O, separate from the renderer's IndexedDB fixture.
    const payload = await run(async () => {
      const repo = window.canvasFixture.repository("local-device");
      const document = await repo.load();
      return {
        document,
        assets: await Promise.all(
          document.assets.map(async (asset) => ({
            asset,
            bytes: Array.from(
              new Uint8Array(await (await repo.asset(asset.id)).arrayBuffer()),
            ),
          })),
        ),
      };
    });
    const { DocumentStore } = require(join(output, "store.cjs"));
    const store = new DocumentStore(
      join(output, "storage-config.json"),
      join(output, "library"),
    );
    const assets = payload.assets.map(({ asset, bytes }) => ({
      asset,
      bytes: new Uint8Array(bytes),
    }));
    const diskDoc = payload.document,
      diskScope = { profile: "perf", documentId: diskDoc.id };
    let t = performance.now();
    await store.save({
      ...diskScope,
      document: diskDoc,
      assets,
      baseRevision: null,
    });
    const initialWriteMs = performance.now() - t,
      saveSamples = [],
      loadSamples = [];
    for (let i = 0; i < 5; i++) {
      const baseRevision = diskDoc.revision;
      diskDoc.revision++;
      diskDoc.blocks.find((b) => b.id === "perf.text.0").source +=
        "\n\n保存校验 " + i;
      t = performance.now();
      await store.save({
        ...diskScope,
        document: diskDoc,
        assets: [],
        baseRevision,
      });
      saveSamples.push(performance.now() - t);
      t = performance.now();
      const loaded = await store.load("perf", diskDoc.id);
      loadSamples.push(performance.now() - t);
      if (JSON.stringify(loaded) !== JSON.stringify(diskDoc))
        throw Error("Package roundtrip changed document");
    }
    report.packageIO = {
      initialWriteMs,
      save: stats(saveSamples),
      load: stats(loadSamples),
      fullDocumentVerified: true,
    };
    console.log(JSON.stringify(report.packageIO));
    writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log("Report: " + output);
    if (keepOpen) {
      win.setTitle("Nomi · 独立性能测试");
      return;
    }
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}
await writeFile(
  join(output, "main.cjs"),
  `(${benchmark})(${JSON.stringify(output)},${process.env.NOMI_PERF_KEEP_OPEN === "1"});`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  cwd: root,
  env,
  stdio: "inherit",
});
const timer =
  process.env.NOMI_PERF_KEEP_OPEN === "1"
    ? null
    : setTimeout(() => child.kill("SIGKILL"), 180000);
const code = await new Promise((r) => child.once("exit", (c) => r(c ?? 1)));
clearTimeout(timer);
console.log("Artifacts: " + output);
process.exitCode = code;
