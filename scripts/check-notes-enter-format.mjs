import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/notes-enter-format");
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
  const run = (fn, arg) =>
    win.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg)})`);
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
    await win.loadFile(join(output, "index.html"), { hash: "/notes" });
    await until(() =>
      run(() => !!document.querySelector('[aria-label="新建文稿"]')),
    );
    await run(() => document.querySelector('[aria-label="新建文稿"]').click());
    await until(() => run(() => !!document.querySelector(".tiptap")?.editor));
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    const cases = [
      ["bold", "<p><strong>Before</strong></p>"],
      ["italic", "<p><em>Before</em></p>"],
      ["strike", "<p><s>Before</s></p>"],
      ["code", "<p><code>Before</code></p>"],
      ["combined", "<p><strong><em><s>Before</s></em></strong></p>"],
      ["bullet", "<ul><li><p><strong>Before</strong></p></li></ul>"],
      ["ordered", "<ol><li><p><em>Before</em></p></li></ol>"],
      [
        "task",
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p><strong>Before</strong></p></li></ul>',
      ],
      ["quote", "<blockquote><p><em>Before</em></p></blockquote>"],
      ["heading", "<h2><em>Before</em></h2>"],
      ["middle", "<p><strong>BeforeSuffix</strong></p>"],
      ["soft break", "<p><strong><em>Before</em></strong></p>", ["shift"]],
    ];
    for (const [name, html, modifiers] of cases) {
      await run((html) => {
        const editor = document.querySelector(".tiptap").editor;
        window.formatEditor = editor;
        editor.commands.setContent(html, { contentType: "html" });
        let caret;
        editor.state.doc.descendants((node, pos) => {
          if (caret === undefined && node.isText) caret = pos + "Before".length;
        });
        editor.commands.setTextSelection(caret);
        editor.view.focus();
      }, html);
      await key("Enter", modifiers);
      await win.webContents.debugger.sendCommand("Input.insertText", {
        text: "Plain",
      });
      const result = await run(() => {
        const text = [];
        window.formatEditor.state.doc.descendants((node) => {
          if (node.isText)
            text.push({
              text: node.text,
              marks: node.marks.map((m) => m.type.name),
            });
        });
        return {
          text,
          html: window.formatEditor.getHTML(),
          active: (
            window.formatEditor.state.storedMarks ??
            window.formatEditor.state.selection.$from.marks()
          ).map((m) => m.type.name),
        };
      });
      assert(
        result.text.some((n) => n.text.includes("Before") && n.marks.length),
        name + ": previous format lost",
      );
      assert(
        result.text.some((n) => n.text.includes("Plain") && !n.marks.length),
        name + ": next line inherits format " + JSON.stringify(result),
      );
      assert(!result.active.length, name + ": active marks remain");
      if (name === "middle")
        assert(
          result.text.some(
            (n) => n.text.includes("Suffix") && n.marks.includes("bold"),
          ),
          "Existing suffix formatting lost",
        );
      if (["bullet", "ordered", "task"].includes(name))
        assert(
          (result.html.match(/<li/g) ?? []).length === 2,
          name + ": list structure lost",
        );
      console.log("Passed " + name);
    }
    writeFileSync(
      join(output, "enter-format.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    console.log(
      "New lines reset typing formats; existing text and list structure preserved.",
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
