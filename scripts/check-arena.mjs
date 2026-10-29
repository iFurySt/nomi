import { uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { build } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, copyFile, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/arena");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-"));
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/arena.tsx"],
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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (check) => {
    for (let i = 0; i < 350; i++) {
      if (check()) return;
      await wait(20);
    }
    throw Error("Arena check timed out: " + check.toString());
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const settings = async () => {
    await until(() => !document.querySelector('[role="dialog"]'));
    const trigger = document.querySelector(
      'button[aria-label="Arena settings"]',
    );
    trigger.focus();
    trigger.click();
    await until(() => document.querySelector('[role="dialog"]'));
  };
  const closeSettings = async () => {
    document.querySelector('[aria-label="Close dialog"]').click();
    await until(() => !document.querySelector('[role="dialog"]'));
  };
  await until(
    () =>
      button("Create $10,000 portfolio") &&
      !button("Create $10,000 portfolio").disabled,
  );
  if (document.body.textContent.includes("coming soon"))
    throw Error("Placeholder remains");
  button("Create $10,000 portfolio").click();
  await until(
    () => button("Start investing") && !button("Start investing").disabled,
  );
  button("Start investing").click();
  await until(() => button("Stop"));
  await settings();
  if (!button("Advance market day").disabled)
    throw Error("Market can advance during session");
  await closeSettings();
  await until(() => document.querySelectorAll(".arena-holding").length === 4);
  if (document.querySelectorAll(".arena-fill-chips .arena-buy").length !== 4)
    throw Error("Fills missing");
  if (!document.querySelector(".arena-cash").textContent.includes("1,990.00"))
    throw Error("Cash missing");
  const chart = document.querySelector(".arena-fund-line");
  if (chart.getAttribute("d").split("L").length !== 2)
    throw Error("NAV not rendered");
  button("Sell").click();
  await until(() => document.querySelector(".arena-feed-empty"));
  if (document.querySelector(".arena-decision"))
    throw Error("Sell filter ignored");
  button("Buy").click();
  await until(() => document.querySelector(".arena-decision"));
  document.querySelector(".arena-decision summary").click();
  if (!document.querySelector(".arena-decision table").checkVisibility())
    throw Error("Fill details unavailable");
  button("All").click();
  button("Run next session").click();
  await until(() => button("Stop"));
  button("Stop").click();
  await until(
    () =>
      document.querySelector(".arena-decision-status").textContent ===
      "cancelled",
  );
  button("Run next session").click();
  await until(
    () =>
      document.querySelectorAll(".arena-decision").length === 3 &&
      !button("Stop"),
  );
  button("Hold").click();
  await until(() => document.querySelectorAll(".arena-decision").length === 1);
  button("All").click();
  await until(() => document.querySelectorAll(".arena-decision").length === 3);
  const before = window.arenaFixture.reads;
  await wait(1700);
  if (window.arenaFixture.reads - before > 1)
    throw Error("Idle Arena keeps polling");
  button("Return").click();
  await until(() =>
    document
      .querySelector(".arena-chart-heading strong")
      .textContent.includes("%"),
  );
  button("Value").click();
  if (document.querySelectorAll(".arena-end-label").length !== 2)
    throw Error("Series endpoints missing");
  if (
    !document
      .querySelector(".arena-holdings-head")
      .textContent.includes("P&L %")
  )
    throw Error("Holding gain percentage missing");
  await settings();
  button("Advance market day").click();
  await until(
    () =>
      document.querySelector('[aria-label="Inspect simulated market day"]')
        .max === "3",
  );
  document.querySelector('[aria-label="Automatic round limit"]').click();
  await until(() => document.querySelector('[role="listbox"]'));
  [...document.querySelectorAll('[role="option"]')]
    .find((o) => o.textContent === "5 rounds")
    .click();
  await until(() => !document.querySelector('[role="listbox"]'));
  button("Start automatic").click();
  await until(() => button("Pause automatic"));
  await settings();
  if (!button("Advance market day").disabled)
    throw Error("Manual market control active during automation");
  await closeSettings();
  location.hash = "/library";
  await wait(1800);
  location.hash = "/arena";
  await until(() => document.querySelector(".arena-auto-progress"));
  await until(
    () =>
      document.querySelector('[aria-label="Automatic decision progress"]')
        ?.value === 5,
  );
  if (button("Pause automatic"))
    throw Error("Automatic batch did not stop at its round limit");
  if (
    document.querySelector('[aria-label="Inspect simulated market day"]')
      .max !== "8"
  )
    throw Error("Automatic rounds did not update NAV history");
  await settings();
  button("Start automatic").click();
  await until(() => button("Pause automatic"));
  button("Pause automatic").click();
  await until(() => !button("Pause automatic"));
  const marks = document.querySelector(
    '[aria-label="Inspect simulated market day"]',
  ).max;
  await wait(1700);
  if (
    document.querySelector('[aria-label="Inspect simulated market day"]')
      .max !== marks
  )
    throw Error("Paused automation still advances");
  return {
    compactSettingsAndChartViews: true,
    automaticRoundsSurviveNavigation: true,
    automaticBudgetAndPause: true,
    createRunHoldCancelAdvance: true,
    decisionFiltersAndFillDetails: true,
    navAndPortfolio: true,
    noIdlePolling: true,
  };
}
function geometry() {
  const root = document.querySelector(".arena-workspace"),
    b = root.getBoundingClientRect();
  if (
    document.documentElement.scrollWidth > innerWidth + 1 ||
    root.scrollWidth > b.width + 1
  )
    throw Error("Arena horizontal overflow");
  const chart = document.querySelector(".arena-chart").getBoundingClientRect();
  if (innerWidth > 1000 && chart.bottom > innerHeight - 70)
    throw Error("Performance chart buried below first screen");
  return {
    chartTop: Math.round(chart.top),
    chartBottom: Math.round(chart.bottom),
    width: innerWidth,
    contentWidth: b.width,
    holds: document.querySelectorAll(".arena-holding").length,
  };
}
function narrowChecks() {
  const choice = (text) =>
    [...document.querySelectorAll(".arena-mobile-tabs button")].find(
      (b) => b.textContent === text,
    );
  choice("Holdings").click();
  return new Promise((resolve) =>
    setTimeout(() => {
      if (
        !document.querySelector(".arena-holding").checkVisibility() ||
        document.querySelector(".arena-chart").checkVisibility()
      )
        throw Error("Holdings view unavailable");
      choice("Overview").click();
      resolve(true);
    }, 50),
  );
}
function toggleDark() {
  document.querySelector('[aria-label="Switch to dark theme"]').click();
}
const main = `const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const path=require('node:path');app.setPath('userData',path.join(__dirname,'profile'));app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1360,height:1000,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});try{await win.loadFile(path.join(__dirname,'index.html'));const report=await win.webContents.executeJavaScript('('+${JSON.stringify(checks.toString())}+')()');report.desktop=await win.webContents.executeJavaScript('('+${JSON.stringify(geometry.toString())}+')()');fs.writeFileSync(path.join(__dirname,'arena-desktop.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript('('+${JSON.stringify(toggleDark.toString())}+')()');await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(__dirname,'arena-dark.png'),(await win.webContents.capturePage()).toPNG());win.setSize(480,900);await new Promise(r=>setTimeout(r,250));report.mobileHoldings=await win.webContents.executeJavaScript('('+${JSON.stringify(narrowChecks.toString())}+')()');await new Promise(r=>setTimeout(r,100));report.narrow=await win.webContents.executeJavaScript('('+${JSON.stringify(geometry.toString())}+')()');fs.writeFileSync(path.join(__dirname,'arena-mobile.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(__dirname,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.exit(0)}catch(e){console.error(e);app.exit(1)}});setTimeout(()=>app.exit(1),25000);`;
await writeFile(join(output, "main.cjs"), main);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  require("electron"),
  [join(output, "main.cjs"), "--no-sandbox"],
  { cwd: root, stdio: "inherit", env },
);
const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
const code = await new Promise((r) => child.once("exit", (c) => r(c ?? 1)));
clearTimeout(timer);
await rm(join(output, "profile"), { recursive: true, force: true });
if (code === 0) {
  for (const name of [
    "report.json",
    "arena-desktop.png",
    "arena-mobile.png",
    "arena-dark.png",
  ])
    await copyFile(join(output, name), join(reports, name));
  await rm(output, { recursive: true, force: true });
}
process.exitCode = code;
