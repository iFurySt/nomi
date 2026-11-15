import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const output = process.env.NOMI_SYNC_TEST_OUTPUT,
  url = process.env.NOMI_SYNC_TEST_URL,
  password = process.env.NOMI_SYNC_TEST_PASSWORD;
assert(
  output && url && password,
  "Run node scripts/check-sync-package.mjs --desktop",
);
const devices = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
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
async function device(name) {
  const folder = join(output, name);
  await mkdir(folder, { recursive: true });
  const main = `
const {app,BrowserWindow,ipcMain,Menu}=require('electron');
const {DocumentStore}=require(${JSON.stringify(join(root, "packages/host/src/document-store.ts"))});
const {createCanvasDocument}=require(${JSON.stringify(join(root, "packages/core/src/canvas/document.ts"))});
const {registerDocumentStorage}=require(${JSON.stringify(join(root, "apps/desktop/src/document-ipc.ts"))});
const {registerAutomation}=require(${JSON.stringify(join(root, "apps/desktop/src/automation.ts"))});
const {registerCloudSync}=require(${JSON.stringify(join(root, "apps/desktop/src/cloud-sync.ts"))});
const path=require('node:path'),fs=require('node:fs/promises'),{pathToFileURL}=require('node:url');
const folder=${JSON.stringify(folder)};
app.setName('Nomi(Dev) Sync ${name}');app.setPath('userData',path.join(folder,'profile'));
let win,automation,host;
process.on('message',async m=>{try{let value;
if(m.action==='eval')value=await win.webContents.executeJavaScript(m.source,true);
else if(m.action==='snapshot')value=(await automation.invoke('snapshot',{})).document;
else if(m.action==='edit'){const s=await automation.invoke('snapshot',{});const d=structuredClone(s.document);d.blocks.find(b=>b.id===m.block).source=m.text;d.revision++;await automation.invoke('commit',{document:d,expectedRevision:s.document.revision,snapshotId:s.snapshotId,assets:[]});value=true;}
else if(m.action==='online'){host.online(m.online);value=true;}
else if(m.action==='capture'){if(m.width)win.setSize(m.width,m.height||850);await new Promise(r=>setTimeout(r,150));await fs.writeFile(m.path,(await win.webContents.capturePage()).toPNG());value=true;}
else if(m.action==='undo'){win.webContents.undo();value=true;}
else if(m.action==='quit'){host.stop();win.destroy();app.quit();return;}
process.send({id:m.id,value});}catch(e){process.send({id:m.id,error:e.message});}});
app.whenReady().then(async()=>{
 const store=new DocumentStore(path.join(folder,'directory.json'),path.join(folder,'library'));
 if(!await store.load('local-device','document.home')){
  const d={...createCanvasDocument(),notes:[{id:'note.sync',title:'同步测试',blocks:['text.one','text.two']}],blocks:[{id:'text.one',type:'markdown',source:${JSON.stringify('# 双端同步\n\n本机文稿。')}},{id:'text.two',type:'markdown',source:'另一段文字。'}],assets:[],board:{id:'board.home',placements:[]}};
  await store.save({profile:'local-device',documentId:d.id,document:d,baseRevision:null,assets:[]});
 }
 const expected=pathToFileURL(${JSON.stringify(join(root, "apps/web/dist/index.html"))}).href;
 const flush=async w=>w.webContents.executeJavaScript('(async()=>{const writes=[];window.dispatchEvent(new CustomEvent("nomi-flush-documents",{detail:{waitUntil:p=>writes.push(p)}}));return (await Promise.all(writes)).every(Boolean)})()');
 registerDocumentStorage(store,expected,flush,()=>host?.saved());
 ipcMain.handle('nomi:runtime-info',()=>({kind:'desktop',platform:process.platform,version:'sync-fixture'}));
 ipcMain.handle('nomi:updates',()=>({version:'sync-fixture',available:false,reason:'Disabled'}));
 ipcMain.handle('nomi:chatgpt',()=>({ok:false,error:'No fixture account'}));
 Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'editMenu'}]));
 win=new BrowserWindow({width:1200,height:850,show:false,webPreferences:{preload:${JSON.stringify(join(root, "apps/desktop/dist/preload.cjs"))},sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await win.loadURL(expected);automation=await registerAutomation(store,expected);host=await registerCloudSync(store,expected,automation.invoke,flush);
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
  devices.push(d);
  await launch();
  return d;
}
const successes = [];
try {
  const a = await device("mac-a"),
    b = await device("mac-b");
  assert.equal((await a.request("status")).enabled, false);
  assert.equal((await b.request("status")).account, undefined);
  await a.ui("eval", { source: "location.hash='#/settings/sync';true" });
  await until(
    () =>
      a.ui("eval", {
        source: "!!document.querySelector('[aria-label=同步密码]')",
      }),
    "login form",
  );
  await a.ui("capture", { path: join(output, "sync-login.png") });
  await a.ui("eval", {
    source: `(()=>{const values={'同步服务':${JSON.stringify(url)},'同步邮箱':'test@example.invalid','同步密码':${JSON.stringify(password)}};for(const [name,value] of Object.entries(values)){const input=document.querySelector('[aria-label="'+name+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}return true})()`,
  });
  await a.ui("eval", {
    source: "document.querySelector('.cloud-sync-form').requestSubmit();true",
  });
  await until(async () => !!(await a.request("status")).account, "UI login");
  await a.request("bind", { mode: "upload" });
  await a.request("sync");
  const space = (await a.request("status")).binding.space;
  await b.request("login", {
    server: url,
    email: "test@example.invalid",
    password,
  });
  await b.request("bind", { mode: "download", space });
  successes.push(
    "optional default off, real login UI, separate encrypted credentials and explicit cloud binding",
  );
  await a.ui("edit", {
    block: "text.one",
    text: "# 双端同步\n\n来自 A 的改动。",
  });
  await a.request("sync");
  await b.request("sync");
  assert(
    (await b.ui("snapshot")).blocks
      .find((b) => b.id === "text.one")
      .source.includes("来自 A"),
  );
  successes.push(
    "real renderer transaction applies remote content and native packages persist",
  );
  await a.ui("online", { online: false });
  await b.ui("online", { online: false });
  await a.ui("edit", { block: "text.one", text: "A 离线编辑第一块" });
  await b.ui("edit", { block: "text.two", text: "B 离线编辑第二块" });
  await a.ui("online", { online: true });
  await until(async () => {
    await a.request("sync");
    return (await a.request("status")).phase === "ready";
  }, "A push");
  await b.ui("online", { online: true });
  await until(async () => {
    await b.request("sync");
    return (await b.request("status")).phase === "ready";
  }, "B merge");
  await a.request("sync");
  assert.equal(
    (await a.ui("snapshot")).blocks.find((b) => b.id === "text.two").source,
    "B 离线编辑第二块",
  );
  assert.equal(
    (await b.ui("snapshot")).blocks.find((b) => b.id === "text.one").source,
    "A 离线编辑第一块",
  );
  successes.push(
    "offline independent edits automatically merge across isolated Electron processes",
  );
  await a.ui("online", { online: false });
  await b.ui("online", { online: false });
  await a.ui("edit", { block: "text.one", text: "同块 A 修改" });
  await b.ui("edit", { block: "text.one", text: "同块 B 修改" });
  await a.ui("online", { online: true });
  await until(async () => {
    await a.request("sync");
    return (await a.request("status")).phase === "ready";
  }, "A competing push");
  await b.ui("online", { online: true });
  await until(async () => {
    await b.request("sync");
    return (await b.request("status")).conflicts > 0;
  }, "same-block conflict");
  await b.ui("eval", { source: "location.hash='#/settings/sync';true" });
  await until(
    () =>
      b.ui("eval", {
        source: "document.body.innerText.includes('查看双方内容')",
      }),
    "conflict settings",
  );
  await b.ui("eval", {
    source:
      "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('查看双方内容')).click();true",
  });
  await until(
    () =>
      b.ui("eval", {
        source:
          "document.body.innerText.includes('同块 A 修改') && document.body.innerText.includes('同块 B 修改')",
      }),
    "both versions",
  );
  await b.ui("capture", { path: join(output, "sync-conflict.png") });
  await b.ui("eval", {
    source:
      "document.querySelectorAll('.cloud-sync-compare input')[1].click();true",
  });
  await b.ui("eval", {
    source:
      "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('应用所选版本')).click();true",
  });
  await until(
    async () => !(await b.request("status")).conflicts,
    "UI conflict resolution",
  );
  assert.equal(
    (await b.ui("snapshot")).blocks.find((b) => b.id === "text.one").source,
    "同块 A 修改",
  );
  successes.push(
    "same-block conflict retains both sides and actual UI resolves reviewed versions",
  );
  await b.stop();
  await b.launch();
  assert.equal(
    (await b.ui("snapshot")).blocks.find((b) => b.id === "text.one").source,
    "同块 A 修改",
  );
  assert((await b.request("status")).account);
  await b.request("enabled", { enabled: false });
  await b.ui("edit", { block: "text.two", text: "同步关闭仍可写入" });
  await b.stop();
  await b.launch();
  assert.equal(
    (await b.ui("snapshot")).blocks.find((b) => b.id === "text.two").source,
    "同步关闭仍可写入",
  );
  assert.equal((await b.request("status")).enabled, false);
  successes.push(
    "process restart retains encrypted login, remote content, and disabled local editing",
  );
  await a.ui("eval", { source: "location.hash='#/settings/sync';true" });
  await a.ui("capture", { path: join(output, "sync-connected.png") });
  await a.ui("eval", {
    source: "document.documentElement.dataset.theme='dark';true",
  });
  await a.ui("capture", {
    path: join(output, "sync-dark-narrow.png"),
    width: 750,
    height: 850,
  });
  const credentials = await readFile(
    join(a.folder, "profile/cloud-sync/account.enc"),
  );
  assert(!credentials.includes(Buffer.from(password)));
  assert(!credentials.includes(Buffer.from("token")));
  await writeFile(
    join(output, "desktop-report.json"),
    JSON.stringify(
      { passed: successes, physicalMacs: false, processes: 2, profiles: 2 },
      null,
      2,
    ),
  );
  console.log("PASS: " + successes.join("; "));
} finally {
  await Promise.all(devices.map((d) => d.stop()));
}
