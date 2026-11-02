import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/notes-navigation");
await mkdir(report, { recursive: true });
const output = await mkdtemp(join(report, "run-"));
await build({
  entryPoints: ["scripts/fixtures/canvas.tsx"],
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
 const js=s=>win.webContents.executeJavaScript(s);
 const until=async(s)=>{for(let i=0;i<200;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+s);};
 const shot=async(name)=>{await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');writeFileSync(${JSON.stringify(report)}+'/'+name+'.png',(await win.webContents.capturePage()).toPNG());};
 try {
 await win.loadFile(${JSON.stringify(join(output, "index.html"))},{hash:'/notes'});
 await until("document.querySelector('[aria-label=新建文稿]')");
 await js("document.querySelector('[aria-label=新建文稿]').click()");
 await until("document.querySelector('[data-save-state=saved]')");
 await js(\`(async () => {
    const repo = window.canvasFixture.repository("local-device"),
      d = await repo.load();
    const revision = d.revision;
    d.notes = [
      {
        id: "nav.root",
        title: "学习资料",
        blocks: [],
        icon: { type: "emoji", value: "📚" },
      },
      { id: "nav.middle", title: "人工智能", parentId: "nav.root", blocks: [] },
      {
        id: "nav.leaf",
        title: "从基础概念到交互学习的长标题示例文稿",
        parentId: "nav.middle",
        blocks: [],
        icon: { type: "emoji", value: "💡" },
      },
    ];
    d.board.placements = [];
    d.board.connectors = [];
    d.revision++;
    await repo.save(d, [], revision);
    location.hash = "/notes?note=nav.leaf";
  })()\`);
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});
 await until("document.querySelector('.notes-breadcrumb [aria-current=page]')?.textContent.includes('交互学习')");
 assert.equal(await js("[...document.querySelectorAll('.notes-breadcrumb button .notes-breadcrumb-title')].map(x=>x.textContent).join('/')"),'学习资料/人工智能');
 assert.equal(await js("document.querySelector('.notes-topbar .notes-breadcrumb')!==null"),true);
 await js("(async()=>{window.navRevision=(await window.canvasFixture.repository('local-device').load()).revision})()");
 await shot('breadcrumb-light');
 await js("document.querySelector('.notes-breadcrumb button').click()");
 await until("document.querySelector('[aria-label=文稿标题]')?.value==='学习资料'");
 assert.equal(await js("document.querySelectorAll('.notes-breadcrumb button').length"),0);
 assert.equal(await js("(async()=>(await window.canvasFixture.repository('local-device').load()).revision===window.navRevision)()"),true);
 await js("location.hash='/notes?note=nav.leaf'");
 await until("document.querySelector('.notes-breadcrumb [aria-current=page]')?.textContent.includes('交互学习')");
 await js("document.documentElement.dataset.theme='dark'");await shot('breadcrumb-dark');
 win.setSize(390,820);
 await until("innerWidth===390");
 assert.equal(await js("document.documentElement.scrollWidth===innerWidth"),true);
 assert.equal(await js("(()=>{const n=document.querySelector('.notes-breadcrumb'),c=n.querySelector('[aria-current=page]');return c.getBoundingClientRect().right<=n.getBoundingClientRect().right+1})()"),true);
 await shot('breadcrumb-mobile');win.setSize(1120,820);
 await until("innerWidth===1120");
 await js("document.documentElement.dataset.theme='light';document.querySelector('[aria-label=\\"Collapse sidebar\\"]').click()");
 await until("document.querySelector('.sidebar-collapsed')");
 await js("location.hash='/settings/appearance'");
 await until("document.querySelector('.settings-content h1')?.textContent==='Appearance'");
 assert.equal(await js("!!document.querySelector('.sidebar-toggle,.mobile-menu')"),false);
 assert.equal(await js("getComputedStyle(document.querySelector('#workspace-sidebar')).display!=='none'"),true);
 await js("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'b',metaKey:true,bubbles:true}))");
 assert.equal(await js("!!document.querySelector('.sidebar-collapsed')"),false);
 assert.equal(await js("localStorage.getItem('nomi.sidebar-collapsed')"),'true');
 await shot('settings-light');
 win.setSize(390,820);await until("innerWidth===390");
 assert.equal(await js("document.documentElement.scrollWidth===innerWidth"),true);
 assert.equal(await js("[...document.querySelectorAll('#workspace-sidebar .settings-nav-link')].every(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})"),true);
 await shot('settings-mobile');
 await js("location.hash='/notes?note=nav.leaf'");
 await until("document.querySelector('.notes-breadcrumb')");
 assert.equal(await js("!!document.querySelector('.sidebar-collapsed')"),true);
 console.log('Notes navigation: PASS (ancestor/current icons, root, parent navigation, revision unchanged, dark/narrow, settings always visible, shortcut ignored, collapse preference retained)');
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
