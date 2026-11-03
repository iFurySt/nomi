import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/chatgpt-login");
await mkdir(report, { recursive: true });
const output = await mkdtemp(join(report, "run-"));
await build({
  entryPoints: ["scripts/fixtures/chatgpt-login.tsx"],
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
 await win.loadFile(${JSON.stringify(join(output, "index.html"))});
 await until("document.querySelector('button')?.textContent.includes('Sign in')");
 const click=label=>js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(label)+').click()');
 assert.equal(await js("document.body.textContent.includes('Connection ·')"),false);
 await click('Sign in with ChatGPT');await until("document.querySelector('[role=alert]')");await shot('failure');
 await js("document.documentElement.dataset.theme='dark'");await shot('failure-dark');
 win.setSize(390,820);await until("innerWidth===390");await shot('failure-mobile');
 assert.equal(await js("document.documentElement.scrollWidth<=innerWidth"),true);
 win.setSize(1120,820);await js("document.documentElement.dataset.theme='light';window.loginFixture.mode('slow')");
 await click('Try again');await until("document.body.textContent.includes('Connecting to ChatGPT')");await shot('waiting');
 assert.equal(await js("!!document.querySelector('.chatgpt-pending-row button') && !document.querySelector('.chatgpt-accounts-heading').textContent.includes('Cancel')"),true);
 await click('Cancel');await until("!document.body.textContent.includes('Connecting to ChatGPT')");
 assert.equal(await js("!!document.querySelector('[role=alert]')"),false);
 await js("window.loginFixture.mode('success')");await click('Sign in with ChatGPT');
 await until("document.body.textContent.includes('demo@example.invalid')");
 assert.equal(await js("!!document.querySelector('[role=alert]')"),false);
 await until("document.querySelector('.chatgpt-welcome')");await shot('welcome');
 assert.equal(await js("document.querySelector('.chatgpt-welcome').getBoundingClientRect().width<=384"),true);
 await click('Got it');await until("!document.querySelector('.chatgpt-welcome')");await shot('success');
 await js("window.loginFixture.mode('slow')");await click('Add account');
 await until("document.querySelector('.chatgpt-pending-row')");
 assert.equal(await js("document.querySelectorAll('.chatgpt-pending-row').length"),1);
 assert.equal(await js("document.body.textContent.includes('demo@example.invalid')"),true);
 await click('Cancel');await until("!document.querySelector('.chatgpt-pending-row')");
 assert.equal(await js("!!document.querySelector('.chatgpt-welcome') || !!document.querySelector('[role=alert]')"),false);


 console.log('ChatGPT login UI: PASS (failure, retry, cancellation, success, dark/mobile)');
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
