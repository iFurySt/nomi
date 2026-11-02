import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = resolve("."),
  report = resolve(".artifacts/note-collections");
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
 const shot=async(name)=>{await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,180));writeFileSync(${JSON.stringify(report)}+'/'+name+'.png',(await win.webContents.capturePage()).toPNG());};
 try {
 await win.loadFile(${JSON.stringify(join(output, "index.html"))},{hash:'/notes'});
 await until("document.querySelector('[aria-label=新建文稿]')");
 await js("document.querySelector('[aria-label=新建文稿]').click()");
 await until("document.querySelector('[data-save-state=saved]')");
 await js(\`(async () => {
   const repo=window.canvasFixture.repository('local-device'),d=await repo.load(), revision=d.revision;
   d.notes=[
     {id:'collection.root',title:'学习与探索',blocks:['collection.intro'],icon:{type:'emoji',value:'📚'}},
     {id:'collection.math',title:'从公式到直觉',parentId:'collection.root',blocks:[],icon:{type:'emoji',value:'🧮'}},
     {id:'collection.visual',title:'交互式学习：图像、笔记与实验',parentId:'collection.root',blocks:[],icon:{type:'emoji',value:'💡'}},
     {id:'collection.long',title:'理解复杂概念的一百种方法：用长标题验证窄窗口中的文稿列表和正文引用块',parentId:'collection.root',blocks:[]},
     {id:'collection.leaf',title:'线性代数',parentId:'collection.math',blocks:[]}
   ];
   d.blocks=[{id:'collection.intro',type:'markdown',source:'把问题写下来，让每一篇文稿成为下一次探索的起点。'}];
   d.board.placements=[];d.board.connectors=[]; d.assets=[]; d.revision++;
   await repo.save(d,[],revision);location.hash='/notes?note=collection.root';
 })()\`);
 await js("new Promise(r=>requestAnimationFrame(r))");
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});
 await until("document.querySelectorAll('.note-collection-blocks .note-link').length===3");
 await js("window.beforeRevision=0;(async()=>window.beforeRevision=(await window.canvasFixture.repository('local-device').load()).revision)()");
 assert.ok(await js("[...document.querySelectorAll('.note-collection .note-icon-image')].every(e=>e.getBoundingClientRect().width<=20)"));
 assert.ok(await js("(()=>{const r=document.querySelector('.note-collection .note-link');return r.querySelector('.note-link-title').getBoundingClientRect().left-r.querySelector('.note-icon-image').getBoundingClientRect().right<12})()"));
 await shot('blocks-light');
 await js("[...document.querySelectorAll('.note-collection-views button')].find(e=>e.textContent==='表格').click()");
 await until("document.querySelector('.note-collection-table')");
 assert.equal(await js("document.querySelectorAll('.note-collection-table tbody tr').length"),3);
 assert.equal(await js("(async()=>(await window.canvasFixture.repository('local-device').load()).revision===window.beforeRevision)()"),true);
 await shot('table-light');
 await js("document.documentElement.dataset.theme='dark'");await shot('table-dark');
 await js("document.documentElement.dataset.theme='light'");
 win.setSize(390,820);await until('innerWidth===390');
 await js("document.querySelector('.note-collection').scrollIntoView({block:'center'})");
 assert.ok(await js("document.documentElement.scrollWidth<=innerWidth"));
 await shot('table-narrow');
 win.setSize(1120,820);await until('innerWidth===1120');
 await js("new Promise(r=>requestAnimationFrame(r))");
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});
 await until("document.querySelector('.note-collection[data-view=table]')");

 const openDocumentPicker=async()=>{
 // Open the actual insertion menu in a paragraph, then select an existing document.
 await js("document.querySelector('.tiptap').focus()");
 await until("document.querySelector('.writing-block-gutter button')");
 await js("document.querySelector('.writing-block-gutter [aria-haspopup=menu]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))");
 await until("document.querySelector('.writing-block-menu')");
 // Non-empty paragraphs expose insertion through the submenu.
 const add=await js("[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent==='文稿')");
 if(!add){
   await js("(()=>{const e=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('在下方插入'));e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))})()");
 }
 await until("[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent==='文稿')");
 await js("[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent==='文稿').click()");
 await until("document.querySelector('[aria-label=查找文稿]')");
 };
 await openDocumentPicker();
 await js("[...document.querySelectorAll('.note-reference-result button')].find(e=>e.textContent.includes('从公式到直觉')).click()");
 await until("document.querySelector('.writing-block-note-reference .note-link')");
 await until("document.querySelector('[data-save-state=saved]')");
 assert.equal(await js("document.querySelector('.writing-block-note-reference .note-link-title').textContent"),'从公式到直觉');
 await shot('reference-in-body');
 const referenceAction=async label=>{
   await js("document.querySelector('.writing-block-note-reference [aria-haspopup=menu]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))");
   await until("document.querySelector('.writing-block-menu')");
   await js("[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.trim()==="+JSON.stringify(label)+").click()");
   await until("!document.querySelector('.writing-block-menu')");
 };
 await referenceAction('上移');
 await until("(async()=>{const d=await window.canvasFixture.repository('local-device').load();return d.blocks.find(b=>b.id===d.notes[0].blocks[0])?.type==='note-reference'})()");
 await referenceAction('下移');
 await until("(async()=>{const d=await window.canvasFixture.repository('local-device').load();return d.blocks.find(b=>b.id===d.notes[0].blocks[0])?.type==='markdown'})()");
 await referenceAction('移出文稿');
 await until("!document.querySelector('.writing-block-note-reference')");
 await js("document.querySelector('.writing-article').dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true}))");
 await until("document.querySelector('.writing-block-note-reference')");
 await js("document.querySelector('.writing-article').dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,shiftKey:true,bubbles:true}))");
 await until("!document.querySelector('.writing-block-note-reference')");
 await js("document.querySelector('.writing-article').dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true}))");
 await until("document.querySelector('.writing-block-note-reference')");
 await until("document.querySelector('[data-save-state=saved]')");
 await js("new Promise(r=>requestAnimationFrame(r))");
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});
 await until("document.querySelector('.writing-block-note-reference .note-link')");
 await js("document.querySelector('.writing-block-note-reference .note-link').click()");
 await until("document.querySelector('[aria-label=文稿标题]')?.value==='从公式到直觉'");
 await js(\`(async()=>{const r=window.canvasFixture.repository('local-device'),d=await r.load(),rev=d.revision; d.notes=d.notes.filter(n=>!['collection.math','collection.leaf'].includes(n.id));d.revision++;await r.save(d,[],rev);location.hash='/notes?note=collection.root'})()\`);
 await js("new Promise(r=>requestAnimationFrame(r))");
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});
 await until("document.querySelector('.writing-block-note-reference .note-link:disabled')");
 assert.equal(await js("document.querySelector('.writing-block-note-reference .note-link-title').textContent"),'从公式到直觉');

 await openDocumentPicker();
 await js("(()=>{const i=document.querySelector('[aria-label=查找文稿]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'新的学习文稿');i.dispatchEvent(new Event('input',{bubbles:true}))})()");
 await until("document.querySelector('.note-reference-results').textContent.includes('没有匹配')");
 await js("document.querySelector('.note-reference-picker > button').click()");
 await until("document.querySelector('[aria-label=文稿标题]')?.value==='新的学习文稿'");
 await until("document.querySelector('[data-save-state=saved]')");
 assert.ok(await js("(async()=>{const d=await window.canvasFixture.repository('local-device').load(),n=d.notes.find(n=>n.title==='新的学习文稿');return n.parentId==='collection.root'&&d.blocks.some(b=>b.type==='note-reference'&&b.noteId===n.id&&d.notes[0].blocks.includes(b.id))})()"));
 await js("location.hash='/notes?note=collection.root'");
 await until("document.querySelector('[aria-label=文稿标题]')?.value==='学习与探索'");
 await js("document.querySelector('.writing-article').dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true}))");
 await until("document.querySelector('[data-save-state=saved]')");
 await until("(async()=>!(await window.canvasFixture.repository('local-device').load()).notes.some(n=>n.title==='新的学习文稿'))()");
 console.log('Note collections: PASS (views, compact icons, responsive, preference, insert reference, move/remove, undo/redo, reopen, navigation, missing target, atomic child creation)');
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
