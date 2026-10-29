import { uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { build } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, copyFile, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/ui-continuity");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-"));
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/ui-continuity.tsx"],
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
  '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>',
);
async function checks() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (check) => {
    for (let i = 0; i < 150; i++) {
      if (check()) return;
      await wait(20);
    }
    throw Error("Timed out: " + check.toString());
  };
  const rows = () => [...document.querySelectorAll(".stock-list-row")];
  const list = () => document.querySelector(".stock-list");
  const heading = () => document.querySelector(".stock-company-header h1");
  const frames = [];
  let sample = true;
  const record = () => {
    if (!sample) return;
    frames.push({
      rows: rows().length,
      name: heading()?.textContent,
      price: document.querySelector(".stock-quote strong")?.textContent,
      chart: !!document.querySelector(".stock-price-chart"),
      symbol: document.querySelector(".stock-company-header small")
        ?.textContent,
    });
    requestAnimationFrame(record);
  };
  const watch = () =>
    document.querySelector(".stock-company-header button[aria-pressed]");
  await until(
    () =>
      rows().length >= 50 &&
      list()?.getAttribute("aria-busy") === "false" &&
      heading()?.textContent === "Apple",
  );
  list().scrollTop = list().scrollHeight;
  await until(
    () => rows().length >= 100 && list().getAttribute("aria-busy") === "false",
  );
  list().scrollTop = 650;
  const loaded = rows().length,
    top = list().scrollTop,
    originalList = list(),
    originalRows = rows(),
    originalHeading = heading(),
    svg = document.querySelector(".stock-price-chart");
  let removed = 0;
  const observer = new MutationObserver((records) => {
    for (const r of records)
      for (const node of r.removedNodes) {
        if (
          node.nodeType === 1 &&
          (node.matches(".stock-list-row") ||
            node.querySelector(".stock-list-row"))
        )
          removed++;
      }
  });
  observer.observe(list(), { childList: true, subtree: true });
  requestAnimationFrame(record);
  const searches = window.continuity.search;
  watch().click();
  await wait(300);
  if (
    list() !== originalList ||
    rows().length !== loaded ||
    rows().some((row, i) => row !== originalRows[i]) ||
    list().scrollTop !== top ||
    removed
  )
    throw Error("Watch replaced list nodes or scroll.");
  if (window.continuity.search !== searches)
    throw Error("Watch re-read an unrelated built-in directory.");
  if (document.querySelector(".stock-price-chart") !== svg)
    throw Error("Watch remounted the chart.");
  originalRows
    .find((row) => row.querySelector("strong").textContent === "MSFT")
    .click();
  await until(() => heading().textContent === "Microsoft");
  await wait(150);
  if (
    heading() !== originalHeading ||
    document.querySelector(".stock-price-chart") !== svg ||
    rows().some((row, i) => row !== originalRows[i])
  )
    throw Error("Stock switch remounted stable content.");
  if (window.continuity.get > 1)
    throw Error("Visible-row identity was reloaded instead of reused.");
  if (
    frames.some((f) => f.symbol?.startsWith("MSFT") && f.name !== "Microsoft")
  )
    throw Error("Stock identity flashed an empty/fallback heading.");
  if (
    frames.some(
      (f) =>
        f.symbol?.startsWith("MSFT") && (!f.chart || f.price !== "$430.00"),
    )
  )
    throw Error("Stock detail flashed blank or mismatched prices.");
  if (frames.some((f) => f.rows < loaded))
    throw Error("Built-in list flashed an empty or truncated frame.");
  sample = false;
  observer.disconnect();
  const researchReads = window.continuity.research;
  document.querySelector("#stock-tab-financials").click();
  await until(() => !!document.querySelector("#stock-panel-financials"));
  if (
    heading() !== originalHeading ||
    rows().some((row, i) => row !== originalRows[i])
  )
    throw Error("Stock tab navigation remounted header/sidebar.");
  document.querySelector("#stock-tab-chart").click();
  await until(
    () => !!document.querySelector("#stock-panel-chart .stock-price-chart"),
  );
  if (window.continuity.research !== researchReads)
    throw Error("Stock tab change reloaded cached research.");
  location.hash = "/settings/appearance";
  await until(() => !!document.querySelector(".settings-content"));
  location.hash = "/stocks/MSFT?tab=chart";
  await until(() => rows().length === loaded);
  if (list().scrollTop !== top)
    throw Error("Leaving and reopening Stocks lost list scroll.");
  const beforeRefresh = rows();
  window.continuity.generation++;
  window.dispatchEvent(new Event("focus"));
  await wait(350);
  if (
    rows().length !== loaded ||
    list().scrollTop !== top ||
    rows().some((row, i) => row !== beforeRefresh[i])
  )
    throw Error(
      "Background snapshot refresh collapsed visible pages or scroll.",
    );
  const openCollections = () =>
    document.querySelector('[aria-label="Stock collection"]').click();
  openCollections();
  await until(() => document.querySelectorAll('[role="option"]').length === 4);
  [...document.querySelectorAll('[role="option"]')]
    .find((e) => e.textContent === "My watchlist")
    .click();
  await until(
    () =>
      list().getAttribute("aria-busy") === "false" &&
      rows().length > 0 &&
      rows().length < 10,
  );
  // MSFT is initially watched. Removing it must retain every other existing row.
  const peers = rows().filter(
    (row) => row.querySelector("strong").textContent !== "MSFT",
  );
  const membershipFrames = [];
  let sampling = true;
  const capture = () => {
    if (!sampling) return;
    membershipFrames.push(rows().length);
    requestAnimationFrame(capture);
  };
  requestAnimationFrame(capture);
  watch().click();
  await wait(300);
  sampling = false;
  if (
    membershipFrames.some((count) => count < peers.length) ||
    peers.some((row) => !row.isConnected)
  )
    throw Error("Watchlist removal cleared unrelated rows.");
  watch().click();
  await wait(300);
  if (peers.some((row) => !row.isConnected))
    throw Error("Watchlist addition remounted existing rows.");
  // Rapid cold selections must commit only the last intent, with matching prices.
  location.hash = "/stocks/GOOGL?tab=chart";
  await wait(20);
  location.hash = "/stocks/AMD?tab=chart";
  await until(() =>
    document
      .querySelector(".stock-company-header small")
      ?.textContent.startsWith("AMD"),
  );
  await wait(300);
  if (
    !document
      .querySelector(".stock-company-header small")
      ?.textContent.startsWith("AMD")
  )
    throw Error("A late navigation response won over the latest click.");
  if (document.querySelector(".stock-quote strong")?.textContent !== "$230.00")
    throw Error("Route changed without its matching data.");
  // Narrowing a loaded list keeps its matching rows while the local query runs.
  const input = document.querySelector('[aria-label="Filter stocks"]');
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, "A");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(35);
  if (!rows().length || list().innerText.includes("Loading stocks"))
    throw Error("Narrowing a loaded list cleared all matching rows.");
  await until(() => list().getAttribute("aria-busy") === "false");
  if (frames.length < 3)
    throw Error(
      "No rendered frames were sampled; continuity check is invalid.",
    );
  location.hash = "/agents";
  await until(() => document.querySelectorAll(".agent-card").length > 0);
  const cards = [...document.querySelectorAll(".agent-card")],
    sidebarRows = rows();
  cards[0].querySelector('[aria-label="Agent actions"]').dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
  await until(() =>
    [...document.querySelectorAll('[role="menuitem"]')].some((e) =>
      /Pause agent|Resume agent/.test(e.textContent),
    ),
  );
  [...document.querySelectorAll('[role="menuitem"]')]
    .find((e) => /Pause agent|Resume agent/.test(e.textContent))
    .click();
  await wait(120);
  if (
    cards.some((card) => !card.isConnected) ||
    sidebarRows.some((row) => !row.isConnected)
  )
    throw Error("Agent toggle remounted unrelated content.");
  document.querySelector('[aria-label="Switch to dark theme"]')?.click();
  await wait(80);
  if (
    cards.some((card) => !card.isConnected) ||
    sidebarRows.some((row) => !row.isConnected)
  )
    throw Error("Theme change replaced page/list DOM.");
  location.hash = "/stocks/AMD?tab=chart";
  await until(() => !!document.querySelector(".stock-about .text-link"));
  document.querySelector(".stock-about .text-link").click();
  await until(
    () =>
      document.querySelector('[aria-label="Research question"]')?.value ===
      "Research AMD.",
  );
  const composer = document.querySelector('[aria-label="Research question"]');
  await until(
    () => !document.querySelector('[aria-label="Send message"]').disabled,
  );
  document.querySelector('[aria-label="Send message"]').click();
  await until(
    () =>
      document.querySelectorAll(".message").length === 2 &&
      !document.querySelector('[aria-label="Stop response"]'),
  );
  if (document.querySelector('[aria-label="Research question"]') !== composer)
    throw Error("Sending a message remounted the composer.");
  if (
    !document
      .querySelector(".message-assistant")
      .textContent.includes("Synthetic streamed reply.")
  )
    throw Error("Live reply was labeled as a sample.");
  // A failed stream must remain provisional and retryable, never saved as a
  // successful assistant message. Exercise the actual React/preload adapter.
  window.chatFixture.failure = true;
  const setPrompt = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  ).set;
  setPrompt.call(composer, "Test an interrupted reply.");
  composer.dispatchEvent(new Event("input", { bubbles: true }));
  await until(
    () => !document.querySelector('[aria-label="Send message"]').disabled,
  );
  document.querySelector('[aria-label="Send message"]').click();
  await until(() => !!document.querySelector('.chat-error [class*="button"]'));
  const stored = JSON.parse(localStorage.getItem("nomi.workspace.v1"))
    .conversations[0];
  if (stored.messages.length !== 3 || stored.messages.at(-1).role !== "user")
    throw Error("Partial reply was persisted as completed.");
  window.chatFixture.failure = false;
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent === "Retry reply")
    .click();
  await until(
    () =>
      JSON.parse(localStorage.getItem("nomi.workspace.v1")).conversations[0]
        .messages.length === 4,
  );
  return {
    watchKeepsDOM: true,
    builtInReadUnaffected: true,
    stockSwitchAtomic: true,
    stockTabsReuseLocalData: true,
    pricesSwitchAtomically: true,
    revisitKeepsScroll: true,
    backgroundRefreshKeepsRange: true,
    watchlistUpdatesInPlace: true,
    latestNavigationWins: true,
    narrowingKeepsMatchingRows: true,
    agentAndThemeUpdatesKeepDOM: true,
    chatDraftAndComposerStable: true,
    completedChatReplyPersists: true,
    interruptedChatReplyIsRetryable: true,
    frames: frames.length,
    loadedRows: loaded,
  };
}
const main = `const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const path=require('node:path');
app.setPath('userData',path.join(__dirname,'profile'));app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1360,height:1000,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});win.webContents.on('console-message',(event)=>{if(event.level==='error')console.error(event.message)});try{await win.loadFile(path.join(__dirname,'index.html'));const report=await win.webContents.executeJavaScript('('+${JSON.stringify(checks.toString())}+')()');fs.writeFileSync(path.join(__dirname,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.exit(0)}catch(error){console.error(error);app.exit(1)}});setTimeout(()=>{console.error('Continuity check timed out');app.exit(1)},25000);`;
await writeFile(join(output, "main.cjs"), main);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  require("electron"),
  [join(output, "main.cjs"), "--no-sandbox"],
  { cwd: root, stdio: "inherit", env },
);
const timeout = setTimeout(() => child.kill("SIGKILL"), 30000);
const exit = await new Promise((resolve) =>
  child.once("exit", (code) => resolve(code ?? 1)),
);
clearTimeout(timeout);
await rm(join(output, "profile"), { recursive: true, force: true });
if (exit === 0) {
  await copyFile(join(output, "report.json"), join(reports, "report.json"));
  await rm(output, { recursive: true, force: true });
}
process.exitCode = exit;
