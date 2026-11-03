import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/canvas-generation");
await mkdir(report, { recursive: true });
const output = await mkdtemp(join(report, "run-"));
await build({
  entryPoints: ["scripts/fixtures/canvas-generation.tsx"],
  outfile: join(output, "renderer.js"),
  bundle: true,
  format: "iife",
  jsx: "automatic",
  conditions: ["style", "browser"],
  define: { "process.env.NODE_ENV": '"development"' },
  alias: {
    "@nomi/core": resolve("packages/core/src/index.ts"),
    "@nomi/platform": resolve("packages/platform/src/index.ts"),
    react: resolve("apps/web/node_modules/react"),
    "react-dom": resolve("apps/web/node_modules/react-dom"),
  },
  loader: uiFixtureAssetLoaders,
  logLevel: "warning",
});
await writeFile(
  join(output, "index.html"),
  '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="renderer.css"><body><div id="root"></div><script src="renderer.js"></script></body></html>',
);
await writeFile(
  join(output, "main.cjs"),
  `
const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
app.disableHardwareAcceleration();
app.setPath('userData',${JSON.stringify(join(output, "profile"))});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1120,height:820,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const js=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){console.error(s);throw e}};
 const until=async(s)=>{for(let i=0;i<200;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+s);};
 const shot=async(name)=>{await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');writeFileSync(${JSON.stringify(report)}+'/'+name+'.png',(await win.webContents.capturePage()).toPNG());};
 try {
 await win.loadFile(${JSON.stringify(join(output, "index.html"))},{hash:'/canvas'});
 await until("document.querySelector('[title*=AI]')");
 const click=label=>js('Array.from(document.querySelectorAll(\"button\")).find(b=>b.textContent.trim()==='+JSON.stringify(label)+').click()');
 await js("document.querySelector('[title*=AI]').click()");
 await until("document.querySelector('[aria-label=生成模型]')?.value==='test-model'");
 await js("(()=>{const t=document.querySelector('[aria-label=生成需求]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'画出输入到输出');t.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await click('生成预览');await until("document.querySelector('[aria-label=生成内容预览]')");
 assert.equal(await js("document.querySelectorAll('.generation-object').length"),2);await shot('preview');
 assert.equal(await js("document.querySelectorAll('.generation-object.shape-card').length===2 && [...document.querySelectorAll('.generation-object.shape-card')].every(o=>{const a=o.getBoundingClientRect(),b=o.querySelector('.canvas-shape-content').getBoundingClientRect();return Math.abs(a.x-b.x)<1&&Math.abs(a.y-b.y)<1&&Math.abs(a.width-b.width)<1&&Math.abs(a.height-b.height)<1})"),true);
 await click('加入画布');await until("!document.querySelector('.generation-dialog')");
 assert.equal(await js("[...document.querySelectorAll('.canvas-shape-content')].some(x=>x.textContent==='Input')"),true);
 await js("document.querySelector('[aria-label=撤销画布修改]').click()");
 await until("![...document.querySelectorAll('.canvas-shape-content')].some(x=>x.textContent==='Input')");
 await js("document.querySelector('[title*=AI]').click();window.aiFixture.mode('invalid')");
 await js("(()=>{const t=document.querySelector('[aria-label=生成需求]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'test');t.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await click('生成预览');await until("document.querySelector('.generation-dialog [role=alert]')");
 assert.equal(await js("!!document.querySelector('.generation-preview')"),false);
 await js("window.aiFixture.mode('slow')");await click('生成预览');await click('停止生成');
 await new Promise(r=>setTimeout(r,1200));assert.equal(await js("!!document.querySelector('.generation-preview')"),false);
 await js("document.documentElement.dataset.theme='dark'");await shot('dark');
 win.setSize(390,820);await until("innerWidth===390");await shot('mobile');
 console.log('Canvas generation UI: PASS (preview, apply, undo, invalid output, cancellation, dark/mobile)');
 app.exit(0);
 }catch(e){console.error(e);await shot('failure');app.exit(1);}
});setTimeout(()=>app.exit(1),60000);
`,
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
