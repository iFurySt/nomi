import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = resolve(".");
const report = resolve(".artifacts/update-ui");
await mkdir(report, { recursive: true });
const output = await mkdtemp(join(report, "run-"));
await build({
  entryPoints: ["scripts/fixtures/updates.tsx"],
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
if(process.env.CI) app.disableHardwareAcceleration();
app.setPath('userData',${JSON.stringify(join(output, "profile"))});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1100,height:780,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const js=source=>win.webContents.executeJavaScript(source);
 const until=async(source)=>{for(let i=0;i<150;i++){if(await js(source))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout: '+source);};
 const shot=async(name)=>writeFileSync(${JSON.stringify(report)}+'/'+name+'.png',(await win.webContents.capturePage()).toPNG());
 try{
 await win.loadFile(${JSON.stringify(join(output, "index.html"))});
 await until("document.querySelector('.rail-update')");
 assert.equal(await js("document.querySelector('.tool-rail').getBoundingClientRect().width"),52);
 assert.equal(await js("document.querySelector('.rail-profile .profile-avatar').getBoundingClientRect().width"),24);
 assert.equal(await js("document.querySelector('.rail-destinations').innerText.trim()"),'');
 assert.equal(await js("window.updateFixture.actions.length"),0);
 await shot('available');
 await js("document.querySelector('.rail-update').click()");
 await until("document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '42'");
 assert.equal(await js("window.updateFixture.actions.join(',')"),'download');
 assert.equal(await js("!!document.querySelector('.update-popover')"),false);
 await shot('downloading');
 await js("document.querySelector('.rail-update').click()");
 await until("document.querySelector('.update-popover')");
 await js("[...document.querySelectorAll('.update-popover button')].find(x=>x.textContent==='取消下载').click()");
 await until("!document.querySelector('.rail-update')");
 await js("window.updateFixture.set({phase:'downloading',progress:undefined})");
 await until("document.querySelector('.update-ring.spinning')");
 await js("window.updateFixture.set({phase:'ready',nextVersion:'0.2.0'})");
 await until("document.querySelector('.update-popover')?.textContent.includes('重启并更新')");
 assert.equal(await js("window.updateFixture.actions.includes('install')"),false);
 await shot('ready');
 await js("document.documentElement.dataset.theme='dark'");
 await until("getComputedStyle(document.documentElement).getPropertyValue('--frame').trim() === '#161616'");
 await new Promise(r=>setTimeout(r,120));
 await shot('ready-dark');
 await js("[...document.querySelectorAll('.update-popover button')].find(x=>x.textContent==='稍后').click()");
 await until("!document.querySelector('.update-popover')");
 await js("document.querySelector('.rail-update').focus();document.querySelector('.rail-update').click()");
 await until("document.querySelector('.update-popover')");
 await js("[...document.querySelectorAll('.update-popover button')].find(x=>x.textContent==='重启并更新').click()");
 await until("window.updateFixture.get().phase==='installing'");
 assert.equal(await js("window.updateFixture.actions.filter(x=>x==='install').length"),1);
 await js("window.updateFixture.set({phase:'error',error:'下载失败，请重试。',canCheck:true})");
 await until("document.querySelector('.update-popover [role=alert]')?.textContent.includes('下载失败')");
 await shot('error');
 await js("[...document.querySelectorAll('.update-popover button')].find(x=>x.textContent==='重新检查').click()");
 await until("!document.querySelector('.rail-update')");
 await js("window.updateFixture.set({phase:'ready'})");
 await until("document.querySelector('.rail-update')");
 win.setSize(390,780);
 await new Promise(r=>setTimeout(r,150));
 assert.equal(await js("document.documentElement.scrollWidth===innerWidth"),true);
 assert.equal(await js("!!document.querySelector('.update-popover')"),false);
 await shot('mobile');
 await js("window.updateFixture.set({phase:'idle',available:false,reason:'开发版本不执行自动更新'})");
 await until("!document.querySelector('.rail-update')");
 console.log('Update UI: PASS (compact rail, download, progress, cancel, later, restart, error, dark/mobile)');app.exit(0);
 }catch(error){console.error(error);await shot('failure');app.exit(1);}
});setTimeout(()=>app.exit(1),45000);
`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  cwd: root,
  env,
  stdio: "inherit",
});
const code = await new Promise((r) => child.once("exit", (c) => r(c ?? 1)));
await rm(output, { recursive: true, force: true });
process.exitCode = code;
