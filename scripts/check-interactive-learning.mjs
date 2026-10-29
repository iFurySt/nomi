import { uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { build } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, rm, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/interactive-learning");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-"));
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/interactive-learning.tsx"],
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
async function checks(phase) {
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (test) => {
    for (let i = 0; i < 200; i++) {
      if (test()) return;
      await wait(20);
    }
    throw Error("Learning timed out: " + test.toString());
  };
  const find = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const range = () => document.querySelector(".learning-slider input");
  const text = () => document.querySelector("#learning-source");
  const source = () =>
    JSON.parse(
      localStorage.getItem('nomi.learning.definition.v1:["local-device"]'),
    );
  const state = () =>
    JSON.parse(
      localStorage.getItem(
        'nomi.learning.state.v1:["local-device","program_temperature"]',
      ),
    );
  const input = (element, value) => {
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const slide = async (value) => {
    input(range(), String(value));
    await wait(25);
    range().dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await wait(25);
  };
  await until(
    () =>
      range() && document.querySelectorAll("path[data-series]").length === 3,
  );
  assert(!document.querySelector(".learning-alert"), "Initial runtime error");
  if (phase === "restored") {
    assert(Number(range().value) === 1.4, "Temperature did not survive reload");
    assert(
      document
        .querySelector('[aria-pressed="true"]')
        .textContent.includes("Temperature"),
      "Mode did not survive reload",
    );
    assert(
      document.querySelector('[data-node="view.title"]').textContent ===
        "My exploration",
      "Definition did not survive reload",
    );
    find("Reset").click();
    await until(() => Number(range().value) === 0.85);
    return { restored: true, reset: true };
  }
  assert(
    getComputedStyle(document.querySelector(".sidebar")).display === "none",
    "Learning has a stock sidebar",
  );
  assert(
    !!document.querySelector(
      '.rail-destinations a[href="#/learn"][aria-current="page"]',
    ),
    "Actual app route is missing",
  );
  assert(document.querySelector(".katex"), "Formula did not render");
  const p = [...document.querySelectorAll("[data-probability]")].map(
    (n) => n.textContent,
  );
  assert(
    p.join(",") === "70.66%,21.79%,7.56%",
    "Default probabilities differ from independent reference",
  );
  await slide(1);
  assert(state().temperature === 1, "Slider commit lost latest state");
  assert(
    document.querySelector('[data-probability="0"]').textContent === "65.90%",
    "Slider did not recompute plot",
  );
  find("Temperature → Probability").click();
  await wait(35);
  assert(state().mode === "temperature", "Mode not committed");
  find("Reset").click();
  await until(() => Number(range().value) === 0.85);
  assert(state().mode === "logit", "Reset did not restore mode");
  await slide(1.4);
  window.learningFixture.failWrites = true;
  await slide(1.5);
  assert(
    document.querySelector(".learning-alert") && state().temperature === 1.4,
    "Failed progress write hid data loss",
  );
  window.learningFixture.failWrites = false;
  find("重试保存").click();
  await wait(25);
  assert(
    !document.querySelector(".learning-alert") && state().temperature === 1.5,
    "Progress save did not recover",
  );
  await slide(1.4);
  find("编辑交互").click();
  await until(() => text());
  input(text(), "{broken");
  await wait(25);
  find("校验并应用").click();
  await wait(25);
  assert(
    document.querySelector('[role="dialog"] [role="alert"]'),
    "Invalid JSON was accepted",
  );
  assert(!source(), "Invalid definition overwrote saved content");
  find("恢复当前定义").click();
  await wait(25);
  const program = JSON.parse(text().value);
  program.nodes.find((n) => n.id === "view.title").props.text =
    "My exploration";
  program.state.temperature.default = 2;
  input(text(), JSON.stringify(program));
  await wait(25);
  window.learningFixture.failWrites = true;
  find("校验并应用").click();
  await wait(25);
  assert(
    document.querySelector('[role="dialog"] [role="alert"]'),
    "Quota failure was hidden",
  );
  assert(!source(), "Failed storage write installed a definition");
  window.learningFixture.failWrites = false;
  find("校验并应用").click();
  await until(() => !text());
  assert(
    Number(range().value) === 1.4,
    "Definition edit reset personal progress",
  );
  assert(
    source().state.temperature.default === 2,
    "Authored default was replaced by personal progress",
  );
  // Restore the definition default so Reset remains independently verifiable.
  find("编辑交互").click();
  await until(() => text());
  const next = JSON.parse(text().value);
  next.state.temperature.default = 0.85;
  input(text(), JSON.stringify(next));
  await wait(25);
  find("校验并应用").click();
  await until(() => !text());
  const imported = JSON.parse(JSON.stringify(next));
  imported.version = 2;
  const transfer = new DataTransfer();
  transfer.items.add(
    new File([JSON.stringify(imported)], "import.nomi-ui.json", {
      type: "application/json",
    }),
  );
  const fileInput = document.querySelector('input[type="file"]');
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  await until(() => text() && JSON.parse(text().value).version === 2);
  find("校验并应用").click();
  await until(() => !text());
  assert(
    source().version === 2 && Number(range().value) === 1.4,
    "Import lost definition or progress",
  );
  find("导出").click();
  await wait(100);
  find("Temperature → Probability").click();
  await wait(25);
  assert(
    document.documentElement.scrollWidth === innerWidth,
    "Desktop overflows",
  );
  assert(
    window.learningFixture.requests === 0,
    "Learning issued a network request",
  );
  return {
    realAppRoute: true,
    localCalculations: true,
    slider: true,
    mode: true,
    reset: true,
    formula: true,
    invalidDefinitionRetained: true,
    quotaFailureVisible: true,
    progressRetry: true,
    compatibleProgressPreserved: true,
    importDefinition: true,
    exportDefinition: true,
  };
}
const main = `const {app,BrowserWindow}=require('electron');const {join}=require('node:path');const {writeFileSync,readFileSync}=require('node:fs');
app.setPath('userData',join(${JSON.stringify(output)},'profile'));
const run=async()=>{const win=new BrowserWindow({show:false,width:1360,height:1150,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});let error;win.webContents.session.on('will-download',(_e,item)=>item.setSavePath(join(${JSON.stringify(output)},'export.json')));win.webContents.on('render-process-gone',(_e,d)=>{error=d.reason});
try{await win.loadFile(join(${JSON.stringify(output)},'index.html'));const check=phase=>'('+${JSON.stringify(checks.toString())}+')('+JSON.stringify(phase)+')';const report=await win.webContents.executeJavaScript(check('initial'));await new Promise(r=>{win.webContents.once("did-finish-load",r);win.reload();});Object.assign(report,await win.webContents.executeJavaScript(check('restored')));
const exported=JSON.parse(readFileSync(join(${JSON.stringify(output)},'export.json'),'utf8'));if(exported.version!==2||exported.state.temperature.default!==.85||exported.temperature!==undefined)throw Error('Export mixed definition and progress');
await win.webContents.executeJavaScript(${JSON.stringify(`localStorage.removeItem('nomi.learning.definition.v1:["local-device"]')`)});await new Promise(r=>{win.webContents.once("did-finish-load",r);win.reload();});await win.webContents.executeJavaScript(${JSON.stringify(`(async()=>{for(let i=0;i<200;i++){if(document.querySelectorAll('.learning-plot path[data-series]').length===3&&document.querySelector('.learning-slider input')){await new Promise(r=>setTimeout(r,80));return;}await new Promise(r=>setTimeout(r,20));}throw Error('Learning not ready for visual capture');})()`)});writeFileSync(join(${JSON.stringify(output)},'learning-desktop.png'),(await win.webContents.capturePage()).toPNG());
await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'learning-dark.png'),(await win.webContents.capturePage()).toPNG());
win.setSize(390,980);await new Promise(r=>setTimeout(r,180));const mobile=await win.webContents.executeJavaScript("document.querySelectorAll('.learning-plot path[data-series]').length===3&&document.documentElement.scrollWidth===innerWidth&&[...document.querySelectorAll('.learning-workspace button,.learning-workspace input,.learning-plot svg')].every(n=>n.getBoundingClientRect().right<=innerWidth+1)");if(!mobile)throw Error('Mobile learning overflow');writeFileSync(join(${JSON.stringify(output)},'learning-mobile.png'),(await win.webContents.capturePage()).toPNG());
// Corrupt progress remains untouched until explicit Reset.
await win.webContents.executeJavaScript(${JSON.stringify(`localStorage.setItem('nomi.learning.state.v1:["local-device","program_temperature"]','{broken')`)});await new Promise(r=>{win.webContents.once("did-finish-load",r);win.reload();});await new Promise(r=>setTimeout(r,150));const corrupt=await win.webContents.executeJavaScript(${JSON.stringify(`(async()=>{for(let i=0;i<200;i++){if(document.querySelector('.learning-alert')&&document.querySelector('.learning-slider input'))return localStorage.getItem('nomi.learning.state.v1:["local-device","program_temperature"]')==='{broken';await new Promise(r=>setTimeout(r,20));}throw Error('Corrupt progress UI did not mount: '+document.body.innerText);})()`)});if(!corrupt)throw Error('Corrupt progress was overwritten');
await win.webContents.executeJavaScript('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Reset").click()');await new Promise(r=>setTimeout(r,80));if(!await win.webContents.executeJavaScript('!document.querySelector(".learning-alert")'))throw Error('Reset did not repair progress');
if(error)throw Error(error);writeFileSync(join(${JSON.stringify(output)},'report.json'),JSON.stringify({...report,mobileNoOverflow:true,corruptProgressPreserved:true,darkTheme:true},null,2));console.log(JSON.stringify(report));app.exit(0);}catch(error){console.error(error);app.exit(1);}};app.whenReady().then(run);setTimeout(()=>app.exit(1),22000);`;
await writeFile(join(output, "main.cjs"), main);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  cwd: root,
  env,
  stdio: "inherit",
});
const timer = setTimeout(() => child.kill("SIGKILL"), 26000);
const code = await new Promise((resolve) =>
  child.once("exit", (code) => resolve(code ?? 1)),
);
clearTimeout(timer);
await rm(join(output, "profile"), { recursive: true, force: true });
if (code === 0) {
  for (const name of [
    "report.json",
    "learning-desktop.png",
    "learning-dark.png",
    "learning-mobile.png",
  ])
    await copyFile(join(output, name), join(reports, name));
  await rm(output, { recursive: true, force: true });
}
process.exitCode = code;
