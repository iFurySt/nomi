import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/document-directory");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-"));
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/document-directory.tsx"],
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
await build({
  entryPoints: [join(root, "apps/desktop/src/preload.ts")],
  outfile: join(output, "preload.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await writeFile(
  join(output, "index.html"),
  '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="renderer.css"><body><div id="root"></div><script src="renderer.js"></script></body></html>',
);
async function checks(phase) {
  const until = async (fn) => {
    for (let i = 0; i < 300; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("Timeout: " + fn + "\n" + document.body.innerText);
  };
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  if (phase === "package-edit") {
    await until(() =>
      document
        .querySelector(".tiptap")
        ?.textContent.includes("AI 直接编辑文件包成功"),
    );
    return true;
  }
  if (phase === "external") {
    location.hash = "/notes";
    await until(() =>
      [...document.querySelectorAll(".notes-list-select")].some((b) =>
        b.textContent.includes("Finder renamed"),
      ),
    );
    const row = [...document.querySelectorAll("[data-note-row]")].find((r) =>
      r
        .querySelector(".notes-list-select")
        ?.textContent.includes("Finder renamed"),
    );
    if (row.getAttribute("aria-expanded") !== "true")
      row.querySelector(".notes-row-toggle").click();
    await until(() =>
      [...document.querySelectorAll(".notes-list-select")].some((b) =>
        b.textContent.includes("Finder child"),
      ),
    );
    const child = [...document.querySelectorAll("[data-note-row]")].find((r) =>
      r
        .querySelector(".notes-list-select")
        ?.textContent.includes("Finder child"),
    );
    assert(
      child.getAttribute("aria-level") === "2",
      "Physical folder parent not reflected in sidebar",
    );
    child.querySelector(".notes-list-select").click();
    await until(() => document.querySelector(".tiptap"));
    assert(
      document.querySelector('[aria-label="文稿标题"]').value ===
        "Finder child",
      "New folder is not editable",
    );
    row.querySelector(".notes-list-select").click();
    return true;
  }
  if (phase === "conflict") {
    await until(() =>
      [...document.querySelectorAll("button")].some((b) =>
        b.textContent.includes("读取磁盘版本"),
      ),
    );
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.includes("读取磁盘版本"))
      .click();
    await until(() => document.body.innerText.includes("原编辑已备份"));
    assert(
      document.querySelector('[aria-label="文稿标题"]').value ===
        "Finder conflict",
      "Conflict resolution did not load physical name",
    );
    return true;
  }
  location.hash = "/canvas";
  await until(
    () =>
      window.directoryFixture && document.querySelector(".canvas-workspace"),
  );
  const { repository, legacy } = window.directoryFixture;
  await until(async () => !!(await repository.load()));
  let disk = await repository.load();
  if (phase === "initial") {
    assert(
      JSON.stringify(disk) === JSON.stringify(await legacy.load()),
      "Migration changed the DSL",
    );
    assert(
      (await (await repository.asset("asset.directory-test")).text()) ===
        "original attachment",
      "Attachment not migrated",
    );
  }
  location.hash = "/notes";
  await until(() => document.querySelector('[aria-label="文稿标题"]'));
  const title = document.querySelector('[aria-label="文稿标题"]');
  if (phase === "initial") {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(title, "保存到目录后继续写作");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    await until(
      async () =>
        (await repository.load()).notes[0].title === "保存到目录后继续写作",
    );
  } else
    assert(
      title.value === "保存到目录后继续写作",
      "Edit did not survive reopening",
    );
  location.hash = "/settings";
  await until(() => document.querySelector(".document-directory-path")?.title);
  const nav = [
    ...document.querySelectorAll('[aria-label="Settings categories"] a'),
  ];
  assert(
    nav[0].textContent === "General" && nav[1].textContent === "Appearance",
    "General not before Appearance",
  );
  assert(
    document.querySelector(".settings-content h1").textContent === "General",
    "General is not the default",
  );
  return {
    migrated: true,
    filesystemTree: true,
    conflictBackup: true,
    attachment: true,
    edited: true,
    settings: true,
    path: document.querySelector(".document-directory-path").title,
  };
}
const main = `
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { DocumentStore } = require(${JSON.stringify(join(root, "packages/host/src/document-store.ts"))});
const { registerDocumentStorage } = require(${JSON.stringify(join(root, "apps/desktop/src/document-ipc.ts"))});
const { encodePackage, readPackage } = require(${JSON.stringify(join(root, "packages/host/src/nomi-package.ts"))});
const { createCanvasDocument } = require(${JSON.stringify(join(root, "packages/core/src/canvas/index.ts"))});
const fs = require('node:fs/promises'), path = require('node:path'), { pathToFileURL } = require('node:url');
const output = ${JSON.stringify(output)}, reports = ${JSON.stringify(reports)};
app.setPath('userData', path.join(output,'profile'));
let choice = null;
dialog.showOpenDialog = async () => ({ canceled: !choice, filePaths: choice ? [choice] : [] });
const timeout = setTimeout(()=>{ console.error('Directory smoke timed out'); app.exit(1); },45000);
app.whenReady().then(async()=>{
  const store = new DocumentStore(path.join(output,'directory.json'),path.join(output,'Documents','Nomi'));
  const url = pathToFileURL(path.join(output,'index.html')).href;
  registerDocumentStorage(store,url, async window => window.webContents.executeJavaScript('(async()=>{const writes=[];window.dispatchEvent(new CustomEvent("nomi-flush-documents",{detail:{waitUntil:p=>writes.push(p)}}));return (await Promise.all(writes)).every(Boolean)})()'));
  ipcMain.handle('nomi:runtime-info',()=>({kind:'desktop',platform:process.platform,version:'fixture'}));
  ipcMain.handle('nomi:updates',()=>({version:'fixture',available:false,reason:'Fixture updates disabled'}));
  ipcMain.handle('nomi:chatgpt',()=>({ok:false,error:'Fixture has no account bridge'}));
  const win = new BrowserWindow({width:1200,height:850,show:true,webPreferences:{preload:path.join(output,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL(url);
  const evaluate = source => win.webContents.executeJavaScript(source,true);
  const results = await evaluate('('+${JSON.stringify(checks.toString())}+')("initial")');
  const oldPath=results.path;
  const tree=path.join(oldPath,'文稿'), original=path.join(tree,'保存到目录后继续写作.nomi'), renamed=path.join(tree,'Finder renamed.nomi');
  await fs.rename(original,renamed);
  const child=path.join(renamed,'children','Finder child.nomi');await fs.mkdir(child,{recursive:true});
  const childDoc={...createCanvasDocument(),notes:[{id:'note.finder',title:'Finder child',blocks:['block.finder']}],blocks:[{id:'block.finder',type:'markdown',source:''}],assets:[],board:{id:'board.finder',placements:[]}};
  for(const [name,bytes] of encodePackage(childDoc,'note','note.finder','Finder child.nomi',{},[],[],new Map())){await fs.mkdir(path.dirname(path.join(child,name)),{recursive:true});await fs.writeFile(path.join(child,name),bytes);}
  await evaluate('('+${JSON.stringify(checks.toString())}+')("external")');
  await fs.writeFile(path.join(reports,'finder-tree.png'),(await win.webContents.capturePage()).toPNG());
  const pkg=await readPackage(renamed);const textBlock=pkg.document.blocks.find(b=>b.type==='markdown');const source=path.join(renamed,'text',textBlock.id+'.md');
  const originalText=await fs.readFile(source);await fs.writeFile(source,'AI 直接编辑文件包成功');
  await evaluate('('+${JSON.stringify(checks.toString())}+')("package-edit")');
  await fs.writeFile(path.join(reports,'package-edit.png'),(await win.webContents.capturePage()).toPNG());
  await fs.writeFile(source,originalText);await store.load('local-device','document.home');
  await fs.rm(child,{recursive:true});
  await store.load('local-device','document.home');await new Promise(r=>setTimeout(r,1800));
  await evaluate(${JSON.stringify(`(() => { const el=document.querySelector('[aria-label="文稿标题"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Unsaved local title'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`)});
  const conflict=path.join(tree,'Finder conflict.nomi');await fs.rename(renamed,conflict);
  await evaluate('('+${JSON.stringify(checks.toString())}+')("conflict")');
  if(!(await fs.readdir(path.join(oldPath,'.nomi-history'))).some(n=>n.startsWith('draft-')))throw Error('Unsaved draft not backed up');
  await fs.rename(conflict,original);
  await new Promise(r=>setTimeout(r,1800));
  await evaluate('('+${JSON.stringify(checks.toString())}+')("reopen")');

  await evaluate('window.nomiDesktop.requestDocuments("choose")');
  if((await store.status()).path!==oldPath)throw Error('Cancel changed directory');
  choice=path.join(output,'selected'); await fs.mkdir(choice);
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="更改").click()');
  for(let i=0;i<200;i++){if((await store.status()).path.endsWith('/selected'))break;await new Promise(r=>setTimeout(r,20));}
  const selected=(await store.status()).path;
  if(!selected.endsWith('/selected'))throw Error('Directory not moved');
  await new Promise(r=>setTimeout(r,150));
  await fs.writeFile(path.join(reports,'general-light.png'),(await win.webContents.capturePage()).toPNG());
  await win.reload(); await new Promise(r=>win.webContents.once('did-finish-load',r));
  const reopened=await evaluate('('+${JSON.stringify(checks.toString())}+')("reopen")');
  if(reopened.path!==selected)throw Error('Directory preference not restored');
  if((await evaluate('window.nomiDesktop.requestDocuments("unknown")')).ok)throw Error('Unknown IPC allowed');
  await evaluate(${JSON.stringify("[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Switch to dark theme').click()")});
  await new Promise(r=>setTimeout(r,300));
  await fs.writeFile(path.join(reports,'general-dark.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(560,800); await new Promise(r=>setTimeout(r,150));
  const fits=await evaluate('document.documentElement.scrollWidth<=innerWidth && document.querySelector(".document-directory-control").getBoundingClientRect().right<=innerWidth');
  if(!fits)throw Error('Directory row overflows');
  await fs.writeFile(path.join(reports,'general-narrow.png'),(await win.webContents.capturePage()).toPNG());
  const files=await fs.readdir(path.join(selected,'workspaces'));
  if(files.length!==1 || !(await fs.readdir(path.join(oldPath,'workspaces'))).length)throw Error('Migration files missing');
  await fs.writeFile(path.join(reports,'result.json'),JSON.stringify({...results,reopened:true,relocation:true,cancel:true,narrow:true,path:'temporary fixture'},null,2));
  console.log('Document package smoke passed: migration, originals, direct source editing, physical nesting, conflicts, IPC, relocation, reload and layout.');
  clearTimeout(timeout);win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
`;
await build({
  stdin: {
    contents: main,
    resolveDir: root,
    sourcefile: "document-directory-smoke.ts",
  },
  outfile: join(output, "main.cjs"),
  platform: "node",
  format: "cjs",
  bundle: true,
  external: ["electron"],
});
const code = await new Promise((resolve) => {
  const child = spawn(require("electron"), [join(output, "main.cjs")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
  child.on("exit", resolve);
});
if (code === 0) await rm(output, { recursive: true, force: true });
process.exitCode = code ?? 1;
