// Exercise the real main-process IPC/save gate with a deterministic native bridge.
import { build } from "esbuild";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
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
let now = 0;
const scheduled = new Map();
const hour = 3_600_000;
const advance = (ms) => {
  const end = now + ms;
  while (true) {
    const next = [...scheduled].sort((a, b) => a[1].at - b[1].at)[0];
    if (!next || next[1].at > end) break;
    now = next[1].at;
    scheduled.delete(next[0]);
    next[1].fn();
  }
  now = end;
};
let state = { phase: "ready", canCheck: false, pendingInstall: false };
const calls = [];
const bridge = {
  start() {},
  state: () => ({ ...state }),
  automatic: (value) => {
    state.automatic = value;
    calls.push(["automatic", value]);
  },
  check: () => calls.push("check"),
  checkBackground: () => calls.push("background"),
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
  app: Object.assign(new EventEmitter(), { getVersion: () => "0.1.0" }),
  powerMonitor: new EventEmitter(),
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
  Date: { now: () => now },
  setTimeout: (fn, delay) => {
    const timer = { unref() {} };
    scheduled.set(timer, { fn, at: now + delay });
    return timer;
  },
  clearTimeout: (timer) => scheduled.delete(timer),
  clearInterval: () => {
    poll = undefined;
  },
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
// The host owns one schedule; wake/focus never replay missed hourly checks.
state = {
  phase: "idle",
  pendingInstall: false,
  canCheck: true,
  automatic: true,
};
const count = (kind) => calls.filter((x) => x === kind).length;
advance(29_999);
electron.app.emit("browser-window-focus");
assert.equal(count("background"), 0);
advance(1);
assert.equal(count("background"), 1);
advance(hour - 1);
assert.equal(count("background"), 1);
advance(1);
assert.equal(count("background"), 2);
electron.app.emit("activate");
electron.powerMonitor.emit("resume");
assert.equal(count("background"), 2);
// Sleep suspends timers. Resume catches up once and resets the next deadline.
now += 3 * hour;
electron.powerMonitor.emit("resume");
electron.app.emit("browser-window-focus");
assert.equal(count("background"), 3);
advance(hour - 1);
assert.equal(count("background"), 3);
advance(1);
assert.equal(count("background"), 4);
await handler(event, "automatic", false);
advance(hour * 2);
electron.powerMonitor.emit("resume");
assert.equal(count("background"), 4);
await handler(event, "check");
await handler(event, "check");
assert.equal(count("check"), 2); // manual checks bypass interval and preference
await handler(event, "automatic", true);
now += hour;
electron.app.emit("browser-window-focus");
assert.equal(count("background"), 4); // focus uses strictly more than an hour
now += 1;
electron.app.emit("browser-window-focus");
assert.equal(count("background"), 5);
state.canCheck = false;
advance(hour);
await handler(event, "check");
assert.equal(count("background"), 5);
assert.equal(count("check"), 2); // never interrupt an active update session
state.canCheck = true;
electron.powerMonitor.emit("resume");
assert.equal(count("background"), 5);
now += 1;
electron.powerMonitor.emit("resume");
assert.equal(count("background"), 6);
electron.app.emit("will-quit");
assert.equal(scheduled.size, 0);
assert.equal(electron.app.listenerCount("browser-window-focus"), 0);
assert.equal(electron.powerMonitor.listenerCount("resume"), 0);
const beforeDisabled = count("background");
context.module.exports.setupUpdates("file:///nomi/index.html", saving, false);
assert.equal(scheduled.size, 0);
advance(hour * 3);
electron.app.emit("browser-window-focus");
electron.powerMonitor.emit("resume");
assert.equal(count("background"), beforeDisabled);
electron.app.emit("will-quit");
console.log(
  "Update host: PASS (IPC, save gates, 30s startup, hourly checks, wake/focus deduplication, manual bypass, preference, busy guard, cleanup)",
);
