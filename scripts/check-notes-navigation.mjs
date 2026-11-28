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
 await win.loadFile(${JSON.stringify(join(output, "index.html"))});
 await until("document.querySelector('[aria-label=新建文稿]')");
 assert.equal(await js('location.hash'), '#/notes');
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
      ...Array.from({ length: 24 }, (_, i) => ({ id: "nav.extra" + i, title: "文稿 " + i, blocks: [] })),
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
 assert.equal(await js("document.querySelector('.workspace-title-slot .notes-breadcrumb')!==null"),true);
 assert.equal(await js("document.querySelectorAll('.notes-breadcrumb').length"),1);
 assert.equal(await js("document.querySelector('.notes-topbar')===null"),true);
 const sidebarScroll = await js(\`(() => {
   const sidebar = document.querySelector('.notes-library');
   const tree = sidebar.querySelector('nav');
   const innerRight = sidebar.getBoundingClientRect().right - parseFloat(getComputedStyle(sidebar).borderRightWidth);
   const end = tree.getBoundingClientRect().right;
   const divider = document.querySelector('.notes-library-resizer').getBoundingClientRect();
   tree.scrollTop = tree.scrollHeight;
   const scrolled = tree.scrollTop > 0;
   tree.scrollTop = 0;
   return { flush: end === innerRight, accessible: divider.left >= end, scrolled };
 })()\`);
 assert.deepEqual(sidebarScroll, { flush: true, accessible: true, scrolled: true });
 const thumbPoint = await js(\`(() => {
   const tree = document.querySelector('.notes-library nav');
   const rect = tree.getBoundingClientRect();
   const width = parseFloat(getComputedStyle(tree, '::-webkit-scrollbar').width);
   const thumb = getComputedStyle(tree, '::-webkit-scrollbar-thumb');
   return { x: Math.floor(rect.right - width / 2), y: Math.ceil(rect.top + 12),
     visibleWidth: width - parseFloat(thumb.borderLeftWidth) - parseFloat(thumb.borderRightWidth) };
 })()\`);
 assert.equal(thumbPoint.visibleWidth, 6);
 const {x, y} = thumbPoint;
 const thumbColor = "getComputedStyle(document.querySelector('.notes-library nav'),'::-webkit-scrollbar-thumb').backgroundColor";
 const transparent = "rgba(0, 0, 0, 0)";
 win.show();
 app.focus({steal:true});
 win.focus();
 win.webContents.debugger.attach('1.3');
 const input = params => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', params);
 await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await until(thumbColor + " === '" + transparent + "'");
 // Reveal the native thumb as a user would before grabbing it.
 await input({type:'mouseWheel', x:x-40, y:y+40, deltaX:0, deltaY:8});
 await until("document.querySelector('.notes-library nav[data-scrolling]')");
 const startScroll = await js("document.querySelector('.notes-library nav').scrollTop");
 await input({type:'mouseMoved',x,y});
 await input({type:'mousePressed',button:'left',buttons:1,x,y,clickCount:1});
 for (let dy=10; dy<=60; dy+=10) {
   await input({type:'mouseMoved',button:'left',buttons:1,x,y:y+dy});
 }
 await until("document.querySelector('.notes-library nav').scrollTop > " + startScroll);
 const pixelAt = async (x,y) => [...(await win.webContents.capturePage({x,y,width:1,height:1})).toBitmap().subarray(0,3)];
 const trackColor = await pixelAt(x+4,y+60);
 await until("getComputedStyle(document.querySelector('.notes-library nav')).getPropertyValue('--tree-thumb-color') === '" + transparent + "'");
 assert.notDeepEqual(await pixelAt(x,y+60), trackColor, 'Thumb stays visible while held');
 await input({type:'mouseReleased',button:'left',buttons:0,x,y:y+60,clickCount:1});
 win.webContents.debugger.detach();
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 assert.deepEqual(await pixelAt(x,y+60), trackColor, 'Idle thumb hides even under the pointer');
 await js("document.querySelector('.notes-library nav').scrollTop = 0");
 await until(thumbColor + " !== '" + transparent + "'");
 await until(thumbColor + " === '" + transparent + "'");
 const parentRow = "document.querySelector('[data-note-row$=root]')";
 const leafRow = "document.querySelector('[data-note-row$=leaf]')";
 const icon = parentRow + ".querySelector('.notes-row-toggle .note-icon-image')";
 const arrow = parentRow + ".querySelector('.notes-row-toggle > svg')";
 const title = parentRow + ".querySelector('.notes-list-select')";
 const hoverRow = async row => {
   const point = await js("(() => { const r = " + row + ".getBoundingClientRect(); return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)} })()");
   win.webContents.sendInputEvent({type: 'mouseMove', ...point});
   await until(row + ".matches(':hover')");
 };
 await hoverRow(leafRow);
 assert.equal(await js(leafRow + ".querySelector('.notes-row-toggle') === null"), true);
 assert.equal(await js(icon + ".checkVisibility()"), true);
 assert.equal(await js(arrow + ".checkVisibility()"), false);
 const titleLeft = await js(title + ".getBoundingClientRect().left");
 await hoverRow(parentRow);
 assert.equal(await js(arrow + ".checkVisibility()"), true);
 assert.equal(await js(icon + ".checkVisibility()"), false);
 assert.equal(await js(title + ".getBoundingClientRect().left"), titleLeft);
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
 for (const account of ['fixture-account-a', 'fixture-account-b', '']) {
   await js('localStorage.setItem("fixture.chatgpt-account",'+JSON.stringify(account)+')');
   await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});
   await until("[...document.querySelectorAll('[data-note-row]')].some(e=>e.dataset.noteRow==='nav.leaf')");
   await js("location.hash='/canvas'");
   await until("document.querySelector('.canvas-workspace')");
   await js("location.hash='/notes?note=nav.leaf'");
   await until("[...document.querySelectorAll('[data-note-row][data-selected]')].some(e=>e.dataset.noteRow==='nav.leaf')");
   assert.equal(await js("document.querySelectorAll('[data-note-row]').length"),27);
 }
 // A new launch URL has no hash; restore the saved note instead of Canvas.
 await until("localStorage.getItem('nomi.last-route')==='#/notes?note=nav.leaf'");
 await win.loadFile(${JSON.stringify(join(output, "index.html"))});
 await until("document.querySelector('.notes-breadcrumb [aria-current=page]')?.textContent.includes('交互学习')");
 assert.equal(await js('location.hash'), '#/notes?note=nav.leaf');
 await js("location.hash='/canvas'");
 await until("localStorage.getItem('nomi.last-route')==='#/canvas'");
 await win.loadFile(${JSON.stringify(join(output, "index.html"))});
 await until("document.querySelector('.canvas-workspace')");
 assert.equal(await js('location.hash'), '#/canvas');
 win.setSize(1120,820);await until("innerWidth===1120");
 const openSearch = async () => {
   await js("document.querySelector('.search-trigger').click()");
   await until("document.activeElement?.matches('.workspace-search-input')");
 };
 await openSearch();
 await shot('workspace-search');
 await js("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))");
 assert.equal(await js("document.activeElement.getAttribute('aria-activedescendant')"),'workspace-result-notes');
 await win.webContents.insertText('zzz');
 await until("document.querySelector('.search-empty')?.textContent==='No matches.'");
 await js("document.activeElement.select()");
 await win.webContents.insertText('sett');
 await until("document.querySelectorAll('.search-results [role=option]').length===1");
 await js("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 await until("location.hash.startsWith('#/settings') && !document.querySelector('.workspace-search-dialog')");
 await openSearch();
 win.setSize(390,600);await until("innerWidth===390");
 await js("document.documentElement.dataset.theme='dark'");
 await shot('workspace-search-narrow-dark');
 assert.equal(await js("document.querySelector('.workspace-search-dialog').getBoundingClientRect().right <= innerWidth"),true);
 await js("document.querySelector('.search-footer button').click()");
 await until("document.querySelector('[role=dialog] h2')?.textContent==='Keyboard shortcuts'");
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
