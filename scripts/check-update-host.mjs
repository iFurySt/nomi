// Exercise the real main-process IPC/save gate with a deterministic native bridge.
import { build } from "esbuild";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { outputFiles } = await build({
  entryPoints: ["apps/desktop/src/updates.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  write: false,
});
let handler, poll;
let state = { phase: "ready", canCheck: false, pendingInstall: false };
const calls = [];
const bridge = {
  start() {},
  state: () => ({ ...state }),
  automatic: (value) => calls.push(["automatic", value]),
  check: () => calls.push("check"),
  download: () => calls.push("download"),
  cancel: () => calls.push("cancel"),
  install: () => {
    calls.push("install");
    state.phase = "installing";
  },
  resume: () => {
    calls.push("resume");
    state.pendingInstall = false;
  },
};
const windows = [{ id: 1 }, { id: 2 }];
const electron = {
  app: { getVersion: () => "0.1.0" },
  BrowserWindow: { getAllWindows: () => windows },
  dialog: { showMessageBox: async () => {} },
  ipcMain: {
    handle: (_, fn) => {
      handler = fn;
    },
  },
};
const context = {
  module: { exports: {} },
  require: (name) =>
    name === "electron"
      ? electron
      : name === "node:module"
        ? { createRequire: () => () => bridge }
        : require(name),
  __filename: "/fixture/updates.cjs",
  process: { platform: "darwin", resourcesPath: "/fixture" },
  console,
  setInterval: (fn) => {
    poll = fn;
    return { unref() {} };
  },
};
vm.runInNewContext(outputFiles[0].text, context);
const pending = [];
let saving = () => new Promise((resolve) => pending.push(resolve));
const updater = context.module.exports.setupUpdates(
  "file:///nomi/index.html",
  (window) => saving(window),
  true,
);
const frame = { url: "file:///nomi/index.html#/notes" };
const event = { senderFrame: frame, sender: { mainFrame: frame } };
const foreignFrame = { url: "https://evil.test" };
await assert.rejects(
  () => handler({ ...event, senderFrame: { url: frame.url } }, "install"),
  /denied/,
);
await assert.rejects(
  () =>
    handler(
      {
        senderFrame: foreignFrame,
        sender: { mainFrame: foreignFrame },
      },
      "download",
    ),
  /denied/,
);
await assert.rejects(() => handler(event, "automatic", "yes"), /Unknown/);
await assert.rejects(
  () => handler(event, "feed", "https://evil.test"),
  /Unknown/,
);
await handler(event, "automatic", false);
assert.deepEqual(calls.pop(), ["automatic", false]);
const first = handler(event, "install");
assert.equal(pending.length, 2);
assert.equal(updater.status().phase, "installing");
await handler(event, "install");
assert.equal(pending.length, 2);
assert(!calls.includes("install"));
pending.splice(0).forEach((resolve, i) => resolve(i === 0));
await first;
assert.equal(updater.status().phase, "ready");
assert.match(updater.status().error, /尚未保存/);
assert(!calls.includes("install"));
saving = async () => true;
await handler(event, "install");
assert.equal(calls.filter((x) => x === "install").length, 1);
// A final native relaunch gate must flush again, including edits after initial click.
state.pendingInstall = true;
saving = async () => false;
poll();
await new Promise((r) => setImmediate(r));
assert(!calls.includes("resume"));
assert.equal(updater.status().phase, "ready");
saving = async () => true;
poll();
await new Promise((r) => setImmediate(r));
assert(!calls.includes("resume")); // no retry loop
await handler(event, "install");
assert.equal(calls.filter((x) => x === "resume").length, 1);
state = { phase: "idle", pendingInstall: false };
await assert.rejects(() => handler(event, "install"), /尚未准备/);
console.log(
  "Update host: PASS (top-frame IPC, method validation, all-window save, one-shot install, final gate, failed-save retry)",
);
