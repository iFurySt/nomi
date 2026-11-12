// Isolated Electron regression for app chrome, not the user's running app.
import { build } from "esbuild";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
await mkdir(".artifacts/window-input", { recursive: true });
const output = await mkdtemp(resolve(".artifacts/window-input/run-"));
await build({
  entryPoints: ["apps/desktop/src/window-policy.ts"],
  outfile: join(output, "policy.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
async function check() {
  const { app, BrowserWindow, Menu } = require("electron");
  const { configureWindowInput, viewMenu } = require("./policy.cjs");
  const assert = require("node:assert/strict");
  app.disableHardwareAcceleration();
  app.setPath("userData", require("node:path").join(__dirname, "profile"));
  await app.whenReady();
  for (const development of [false, true]) {
    const menu = Menu.buildFromTemplate([viewMenu(development)]);
    const roles = menu.items[0].submenu.items.map((item) => item.role);
    for (const role of [
      "reload",
      "forcereload",
      "resetzoom",
      "zoomin",
      "zoomout",
    ])
      assert(!roles.includes(role));
    assert.equal(roles.includes("toggledevtools"), development);
    assert(roles.includes("togglefullscreen"));
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([viewMenu(false), { role: "editMenu" }]),
  );
  const win = new BrowserWindow({
    show: false,
    webPreferences: { backgroundThrottling: false, devTools: false },
  });
  configureWindowInput(win.webContents);
  let loads = 0;
  win.webContents.on("did-finish-load", () => loads++);
  const js = (script) => win.webContents.executeJavaScript(script);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  await win.loadURL(
    'data:text/html,<textarea autofocus>Keep this draft</textarea><script>window.keys=[];document.addEventListener("keydown",e=>window.keys.push(e.key));</script>',
  );
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand(
    "Emulation.setFocusEmulationEnabled",
    { enabled: true },
  );
  await js('document.querySelector("textarea").focus()');
  const cmd = process.platform === "darwin" ? "meta" : "control";
  for (const [keyCode, modifiers] of [
    ["r", [cmd]],
    ["r", [cmd, "shift"]],
    ["F5", []],
    ["F5", ["control"]],
    ["+", [cmd]],
    ["=", [cmd]],
    ["-", [cmd]],
    ["0", [cmd]],
  ]) {
    for (const type of ["keyDown", "keyUp"])
      win.webContents.sendInputEvent({ type, keyCode, modifiers });
  }
  await delay(150);
  assert.equal(loads, 1);
  assert.equal(win.webContents.getZoomFactor(), 1);
  assert.deepEqual(await js("window.keys"), []);
  for (const keyCode of ["z", "c", "v", "[", "]"]) {
    win.webContents.sendInputEvent({
      type: "keyDown",
      keyCode,
      modifiers: [cmd],
    });
    win.webContents.sendInputEvent({
      type: "keyUp",
      keyCode,
      modifiers: [cmd],
    });
  }
  await delay(100);
  const keys = await js("window.keys");
  for (const key of ["z", "c", "v", "[", "]"])
    assert(keys.includes(key), key + " must remain available");
  win.webContents.setZoomFactor(1.5);
  await new Promise((resolve) => {
    win.webContents.once("did-finish-load", resolve);
    win.reload();
  });
  assert.equal(win.webContents.getZoomFactor(), 1);
  assert.equal(win.webContents.isDevToolsOpened(), false);
  console.log(
    "Window input: PASS (production/development menus, reload/zoom blocked, editing/navigation preserved, scale restored)",
  );
  app.exit(0);
}
await writeFile(
  join(output, "main.cjs"),
  `(${check})();setTimeout(()=>require('electron').app.exit(1),15000);process.on('unhandledRejection',e=>{console.error(e);require('electron').app.exit(1)});`,
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
