// Focused real-component regression; independent of the App and data services.
import { build } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url)),
  reports = join(root, ".artifacts/canvas");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "popovers-"));
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/canvas-popovers.tsx"],
  outfile: join(output, "renderer.js"),
  bundle: true,
  format: "iife",
  jsx: "automatic",
  conditions: ["style", "browser"],
  define: { "process.env.NODE_ENV": '"development"' },
  alias: {
    "@nomi/core": join(root, "packages/core/src/index.ts"),
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
async function check(options) {
  const wait = () => new Promise((r) => setTimeout(r, 50)),
    assert = (v, msg) => {
      if (!v) throw Error(msg);
    };
  for (let i = 0; i < 50 && !window.popoverFixture; i++) await wait();
  window.popoverFixture(options);
  await wait();
  const labels =
    options.kind === "connector"
      ? ["起点标记", "终点标记", "连线颜色与透明度", "线条设置", "更多操作"]
      : ["切换形状", "形状填充", "形状边框", "对象更多操作"];
  const verify = () => {
    const panel = document.querySelector(".connector-panel"),
      r = panel.getBoundingClientRect(),
      bar = document
        .querySelector(".connector-toolbar")
        .getBoundingClientRect(),
      gap = Math.min(
        Math.abs(r.bottom - bar.top),
        Math.abs(r.top - bar.bottom),
      );
    assert(Math.abs(gap - 6) < 1.1, `Detached panel: ${gap}`);
    assert(
      r.left >= 11 &&
        r.right <= innerWidth - 11 &&
        r.top >= 11 &&
        r.bottom <= innerHeight - 11,
      "Panel escaped window",
    );
    assert(
      r.width <= 224.5 && panel.scrollWidth <= panel.clientWidth + 1,
      "Panel too wide / horizontal overflow",
    );
    assert(
      options.bottom ? r.bottom <= bar.top : r.top >= bar.bottom,
      "Panel opened on wrong side",
    );
  };
  for (const label of labels) {
    const button = document.querySelector(`button[aria-label="${label}"]`);
    button.click();
    await wait();
    verify();
    const more = document.querySelector(".connector-more-heads");
    if (more) {
      more.click();
      await wait();
      verify();
    }
    if (label === "更多操作") {
      const layer = [...document.querySelectorAll('[role="menuitem"]')].find(
        (e) => e.textContent.includes("图层"),
      );
      if (layer) {
        layer.click();
        await wait();
        verify();
      }
    }
    button.click();
    await wait();
  }
  if (options.kind === "shape") {
    document.querySelector('button[aria-label="切换形状"]').click();
    await wait();
    for (const glyph of document.querySelectorAll(
      ".selection-shape-grid svg :is(path,polygon,rect,ellipse)",
    )) {
      const style = getComputedStyle(glyph);
      assert(
        style.vectorEffect === "non-scaling-stroke" &&
          Math.abs(parseFloat(style.strokeWidth) - 1.75) < 0.01,
        "Shape glyph has a scaled / thin stroke",
      );
    }
    document.querySelector('button[aria-label="切换形状"]').click();
    await wait();
  }
  document
    .querySelector(
      `button[aria-label="${labels[options.kind === "shape" ? 0 : 1]}"]`,
    )
    .click();
  await wait();
  verify();
  return labels.length;
}
// Measure actual ink bounds, including the fixed stroke, in the toolbar SVG.
// Checking the menu glyphs alone misses a separate, unpadded toolbar viewBox.
async function checkShapeBounds() {
  for (const shape of window.popoverShapes) {
    window.popoverFixture({ kind: "shape", bottom: false, zoom: 1, shape });
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const svg = document.querySelector(".selection-shape-icon"),
      box = svg.getBBox(),
      rect = svg.getBoundingClientRect(),
      matrix = svg.getScreenCTM(),
      min = new DOMPoint(box.x, box.y).matrixTransform(matrix),
      max = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(
        matrix,
      ),
      radius = shape === "text" ? 0 : 1.75 / 2;
    if (
      min.x - radius < rect.left + 0.1 ||
      max.x + radius > rect.right - 0.1 ||
      min.y - radius < rect.top + 0.1 ||
      max.y + radius > rect.bottom - 0.1
    )
      throw Error("Toolbar shape ink is clipped: " + shape);
  }
  window.popoverFixture({
    kind: "shape",
    bottom: false,
    zoom: 1,
    shape: "ellipse",
  });
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
  return window.popoverShapes.length;
}
// Native mouse events, including a pause in the six-pixel gap.
function hoverState(phase, label) {
  const button = document.querySelector(`button[aria-label="${label}"]`),
    r = button.getBoundingClientRect();
  if (phase === "point")
    return {
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
    };
  const panel = document.querySelector(".connector-panel");
  if (phase === "closed") {
    if (panel) throw Error("Menu did not close after leaving");
    return;
  }
  if (!panel || button.getAttribute("aria-expanded") !== "true")
    throw Error("Hover did not open / retain " + label);
  const p = panel.getBoundingClientRect(),
    bar = document.querySelector(".connector-toolbar").getBoundingClientRect();
  return {
    gap: {
      x: Math.round(r.x + r.width / 2),
      y: Math.round(p.bottom <= bar.top ? bar.top - 3 : bar.bottom + 3),
    },
    inside: { x: Math.round(p.x + 12), y: Math.round(p.y + 12) },
  };
}
const main = `const {app,BrowserWindow}=require('electron');const {join}=require('node:path');const {writeFileSync}=require('node:fs');
app.setPath('userData',join(${JSON.stringify(output)},'profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
const hover=(phase,label)=>win.webContents.executeJavaScript('('+${JSON.stringify(hoverState.toString())}+')('+JSON.stringify(phase)+','+JSON.stringify(label)+')').catch(e=>{throw new Error(phase+' / '+label+': '+e.message);});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{await win.loadFile(join(${JSON.stringify(output)},'index.html'));let count=0,hoverCount=0;
for(const size of [1000,390]){win.setSize(size,800);for(const kind of ['connector','shape'])for(const bottom of [false,true])for(const zoom of kind==='connector'?[0.5,1,2.5]:[1]){
win.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});await pause(220);
const options={kind,bottom,zoom};count+=await win.webContents.executeJavaScript('('+${JSON.stringify(check.toString())}+')('+JSON.stringify(options)+')');
if(zoom===1){
win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
const labels=kind==='connector'?['起点标记','终点标记','连线颜色与透明度','线条设置','更多操作']:['切换形状','形状填充','形状边框','对象更多操作'];
for(const label of labels){
win.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});await pause(220);
win.webContents.sendInputEvent({type:'mouseMove',...await hover('point',label)});await pause(60);
const positions=await hover('open',label);
win.webContents.sendInputEvent({type:'mouseMove',...positions.gap});await pause(60);
win.webContents.sendInputEvent({type:'mouseMove',...positions.inside});await pause(240);await hover('retained',label);
win.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});await pause(220);await hover('closed',label);hoverCount++;
}
win.webContents.sendInputEvent({type:'mouseMove',...await hover('point',labels[kind==='shape'?0:1])});await pause(60);await hover('open',labels[kind==='shape'?0:1]);
}
if(zoom===1)writeFileSync(join(${JSON.stringify(reports)},'popover-'+kind+'-'+size+'-'+(bottom?'above':'below')+'.png'),(await win.webContents.capturePage()).toPNG());
} }
win.setSize(1000,800);win.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});await pause(220);
const shapeBounds=await win.webContents.executeJavaScript('('+${JSON.stringify(checkShapeBounds.toString())}+')()');
writeFileSync(join(${JSON.stringify(reports)},'toolbar-ellipse-bounds.png'),(await win.webContents.capturePage()).toPNG());
console.log(JSON.stringify({compactAnchoredPopovers:true,menuChecks:count,nativeHoverChecks:hoverCount,shapeInkBounds:shapeBounds}));app.exit(0);}catch(e){console.error(e);app.exit(1);}});`;
await writeFile(join(output, "main.cjs"), main);
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  stdio: "inherit",
});
const code = await new Promise((resolve) => child.on("exit", resolve));
if (code === 0) await rm(output, { recursive: true, force: true });
process.exitCode = code ?? 1;
