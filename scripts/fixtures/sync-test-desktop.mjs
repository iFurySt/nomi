import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../../", import.meta.url));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, label) {
  let error;
  for (let i = 0; i < 120; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      error = e;
    }
    await delay(100);
  }
  throw error ?? Error(`Timeout: ${label}`);
}
export async function launchSyncDesktop(output, name) {
  const folder = join(output, name);
  await mkdir(folder, { recursive: true });
  const main = `
const {app,BrowserWindow,ipcMain,Menu,shell}=require('electron');
let browserURL,web,appReturn; shell.openExternal=async url=>{browserURL=url;};
require('node:os').hostname=()=> 'Test Mac';
const {DocumentStore}=require(${JSON.stringify(join(root, "packages/host/src/document-store.ts"))});
const {createCanvasDocument}=require(${JSON.stringify(join(root, "packages/core/src/canvas/document.ts"))});
const {registerDocumentStorage}=require(${JSON.stringify(join(root, "apps/desktop/src/document-ipc.ts"))});
const {registerAutomation}=require(${JSON.stringify(join(root, "apps/desktop/src/automation.ts"))});
const {registerCloudSync}=require(${JSON.stringify(join(root, "apps/desktop/src/cloud-sync.ts"))});
const path=require('node:path'),fs=require('node:fs/promises'),{pathToFileURL}=require('node:url');
const folder=${JSON.stringify(folder)};
app.setName('Nomi(Dev) Sync ${name}');app.setPath('userData',path.join(folder,'profile'));
let win,automation,host,loseAck=false,deviceDelay=0,deviceFailure=false,deviceRequests=0;
const realFetch=globalThis.fetch;
globalThis.fetch=async (...args)=>{if(String(args[0]).endsWith('/v1/sessions')){deviceRequests++;await new Promise(r=>setTimeout(r,deviceDelay));if(deviceFailure)throw Error('Synthetic device network unavailable');}const response=await realFetch(...args);if(loseAck&&String(args[0]).endsWith('/commit')&&response.ok){loseAck=false;await response.arrayBuffer();throw Error('Synthetic response lost after real commit');}return response;};
process.on('message',async m=>{try{let value;
if(m.action==='deviceRequests')value=deviceRequests;
else if(m.action==='appReturn')value=appReturn;
else if(m.action==='browserURL')value=browserURL;
else if(m.action==='webOpen'){web=new BrowserWindow({width:800,height:720,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});web.webContents.on('will-navigate',(event,url)=>{if(url.startsWith('nomi')){event.preventDefault();appReturn=url;}});await web.loadURL(browserURL);await fs.writeFile(path.join(folder,'browser-login.png'),(await web.webContents.capturePage()).toPNG());value=true;}
else if(m.action==='webEval')value=await web.webContents.executeJavaScript(m.source,true);
else if(m.action==='webClose'){web.destroy();browserURL=undefined;value=true;}
else if(m.action==='eval')value=await win.webContents.executeJavaScript(m.source,true);
else if(m.action==='snapshot')value=(await automation.invoke('snapshot',{})).document;
else if(m.action==='edit'){const s=await automation.invoke('snapshot',{});const d=structuredClone(s.document);d.blocks.find(b=>b.id===m.block).source=m.text;d.revision++;await automation.invoke('commit',{document:d,expectedRevision:s.document.revision,snapshotId:s.snapshotId,assets:[]});value=true;}
else if(m.action==='deviceNetwork'){deviceDelay=m.delay||0;deviceFailure=!!m.fail;value=true;}
else if(m.action==='loseAck'){loseAck=true;value=true;}
else if(m.action==='online'){host.online(m.online);value=true;}
else if(m.action==='capture'){if(m.width)win.setSize(m.width,m.height||850);await new Promise(r=>setTimeout(r,200));await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(m.path,(await win.webContents.capturePage()).toPNG());value=true;}
else if(m.action==='undo'){win.webContents.undo();value=true;}
else if(m.action==='quit'){host.stop();win.destroy();app.quit();return;}
process.send({id:m.id,value});}catch(e){process.send({id:m.id,error:e.message});}});
app.whenReady().then(async()=>{
 const store=new DocumentStore(path.join(folder,'directory.json'),path.join(folder,'library'));
 if(!await store.load('local-device','document.home')){
  const d={...createCanvasDocument(),notes:[{id:'note.sync',title:'同步测试',blocks:['text.one','text.two']}],blocks:[{id:'text.one',type:'markdown',source:${JSON.stringify("# 双端同步\n\n本机文稿。")}},{id:'text.two',type:'markdown',source:'另一段文字。'}],assets:[],board:{id:'board.home',placements:[]}};
  await store.save({profile:'local-device',documentId:d.id,document:d,baseRevision:null,assets:[]});
 }
 const expected=pathToFileURL(${JSON.stringify(join(root, "apps/web/dist/index.html"))}).href;
 const flush=async w=>w.webContents.executeJavaScript('(async()=>{const writes=[];window.dispatchEvent(new CustomEvent("nomi-flush-documents",{detail:{waitUntil:p=>writes.push(p)}}));return (await Promise.all(writes)).every(Boolean)})()');
 registerDocumentStorage(store,expected,flush,document=>host?.saved(document));
 ipcMain.handle('nomi:runtime-info',()=>({kind:'desktop',platform:process.platform,version:'sync-fixture'}));
 ipcMain.handle('nomi:updates',()=>({version:'sync-fixture',available:false,reason:'Disabled'}));
 ipcMain.handle('nomi:chatgpt',()=>({ok:false,error:'No fixture account'}));
 Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'editMenu'}]));
 win=new BrowserWindow({width:1200,height:850,show:false,webPreferences:{preload:${JSON.stringify(join(root, "apps/desktop/dist/preload.cjs"))},sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 await win.loadURL(expected+'#/settings/sync');await new Promise(r=>setTimeout(r,750));automation=await registerAutomation(store,expected);host=await registerCloudSync(store,expected,automation.invoke,flush);
 if(!host)throw Error('Cloud sync failed to initialize');
 process.send({ready:true});
}).catch(e=>{console.error(e);app.exit(1)});
`;
  const path = join(folder, "main.cjs");
  await build({
    stdin: {
      contents: main,
      resolveDir: root,
      sourcefile: "sync-desktop-fixture.ts",
    },
    outfile: path,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  });
  let child,
    serial = 0;
  const pending = new Map();
  const ui = (action, fields = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`${name} ${action} timeout`));
      }, 70000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      child.send({ id, action, ...fields });
    });
  const launch = async () => {
    child = spawn(require("electron"), [path], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", NOMI_MCP: "0" },
    });
    child.stderr.on("data", (b) => {
      if (!/WARNING|property cache/.test(b.toString())) process.stderr.write(b);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Electron startup timeout")),
        30000,
      );
      child.on("message", (m) => {
        if (m.ready) {
          clearTimeout(timer);
          resolve();
        } else {
          const p = pending.get(m.id);
          if (p) {
            pending.delete(m.id);
            m.error ? p.reject(Error(m.error)) : p.resolve(m.value);
          }
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error(`Electron exited ${code}`));
        for (const p of pending.values()) p.reject(Error("Electron exited"));
        pending.clear();
      });
    });
    await until(() => ui("snapshot"), "document ready");
  };
  const stop = async () => {
    if (child?.exitCode === null) {
      const done = new Promise((r) => child.once("exit", r));
      child.send({ action: "quit" });
      await done;
    }
  };
  const request = (method, params) =>
    ui("eval", {
      source: `window.nomiDesktop.requestSync(${JSON.stringify(method)},${JSON.stringify(params) ?? "undefined"})`,
    });
  const d = { ui, request, stop, launch, folder };
  await launch();
  return d;
}
