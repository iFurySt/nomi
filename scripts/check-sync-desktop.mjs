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
  const closeAccount = async (d) => {
    await d.ui("eval", {
      source:
        "document.querySelector('[role=menu]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true",
    });
  };
  const openAccount = async (d) => {
    if (
      await d.ui("eval", {
        source: "!!document.querySelector('.workspace-menu-identity')",
      })
    )
      return;
    await d.ui("eval", {
      source: `document.querySelector('[aria-label="Account menu"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));true`,
    });
    await until(
      () =>
        d.ui("eval", {
          source: "!!document.querySelector('.workspace-menu-identity')",
        }),
      "account menu",
    );
  };
  const navigate = async (d, section) => {
    if (section === "account") return openAccount(d);
    await closeAccount(d);
    await d.ui("eval", {
      source: `location.hash='#/settings/${section}';true`,
    });
    await until(
      () =>
        d.ui("eval", {
          source: `document.querySelector('.settings-content > h1')?.textContent==='Cloud Sync'`,
        }),
      "settings route",
    );
  };
  const click = (d, text) =>
    d.ui("eval", {
      source: `[...document.querySelectorAll('button,[role=menuitem]')].find(b=>b.textContent===${JSON.stringify(text)}).click();true`,
    });
  const fill = (d, values) =>
    d.ui("eval", {
      source: `(()=>{for(const [name,value] of Object.entries(${JSON.stringify(values)})){const input=document.querySelector('[aria-label="'+name+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}return true})()`,
    });
  const signIn = async (d, alreadyStarted = false) => {
    if (!alreadyStarted)
      await d.ui("eval", {
        source:
          "void window.nomiDesktop.requestSync('signIn').then(()=>window.dispatchEvent(new Event('nomi-account-changed')));true",
      });
    await until(() => d.ui("browserURL"), "browser login URL");
    await d.ui("webOpen");
    assert.equal(
      await d.ui("webEval", {
        source: "getComputedStyle(document.querySelector('main')).maxWidth",
      }),
      "340px",
    );
    await d.ui("webEval", {
      source: `document.querySelector('[name=email]').value='test@example.invalid';document.querySelector('[name=password]').value=${JSON.stringify(password)};document.querySelector('form').requestSubmit();true`,
    });
    await until(
      () =>
        d.ui("webEval", {
          source:
            "!!document.querySelector('a[href=\"nomi-dev://account/complete\"]')",
        }),
      "browser approved",
    );
    await until(() => d.ui("appReturn"), "automatic app return");
    await until(
      async () => !(await d.request("status")).signingIn,
      "claim completed",
    );
    await d.ui("webClose");
  };
  await navigate(a, "sync");
  await until(
    () =>
      a.ui("eval", {
        source:
          "!document.querySelector('[aria-label=\"Base URL\"]')?.disabled",
      }),
    "server settings",
  );
  assert.equal(
    await a.ui("eval", {
      source: "document.querySelector('[aria-label=\"Base URL\"]').value",
    }),
    "https://nomi.ifuryst.com",
  );
  assert.equal(
    await a.ui("eval", {
      source: "document.querySelectorAll('.settings-content input').length",
    }),
    1,
  );
  assert.equal(
    await a.ui("eval", {
      source: "!!document.querySelector('input[type=password]')",
    }),
    false,
  );
  await fill(a, { "Base URL": url + "/" });
  await a.ui("eval", {
    source:
      "document.querySelector('.cloud-sync-settings form').requestSubmit();true",
  });
  await until(
    async () => (await a.request("status")).server === url,
    "persist URL",
  );
  await until(
    () =>
      a.ui("eval", {
        source:
          "document.querySelector('.cloud-sync-settings form')?.getAttribute('aria-busy')==='false'",
      }),
    "configuration saved",
  );
  await assert.rejects(
    a.request("configure", { server: "http://example.invalid" }),
    /HTTPS/,
  );
  await assert.rejects(
    a.request("configure", { server: "https://user:pass@example.invalid" }),
  );
  await a.stop();
  await a.launch();
  assert.equal((await a.request("status")).server, url);
  await navigate(a, "sync");
  await a.ui("capture", { path: join(output, "cloud-sync-config.png") });
  await a.ui("eval", {
    source:
      "document.querySelector('[aria-label=\"Account menu\"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));true",
  });
  await until(
    () =>
      a.ui("eval", {
        source: "!!document.querySelector('.workspace-menu-identity')",
      }),
    "profile menu",
  );
  assert.equal(
    await a.ui("eval", {
      source:
        "document.querySelector('.workspace-menu-identity').textContent.includes('ChatGPT')",
    }),
    false,
  );
  await a.ui("eval", {
    source: "document.querySelector('.workspace-menu-identity').click();true",
  });
  assert.equal(
    await a.ui("eval", {
      source: "!!document.querySelector('[href=\"#/settings/account\"]')",
    }),
    false,
  );
  await signIn(a, true);
  await until(
    async () => !!(await a.request("status")).binding,
    "automatic first sync",
  );
  assert.equal((await a.request("spaces")).length, 1);
  await assert.rejects(
    a.request("configure", { server: "https://example.invalid/api" }),
    /退出登录/,
  );
  assert.equal((await a.request("status")).server, url);
  await a.request("sync");
  const space = (await a.request("status")).binding.space;
  await b.request("configure", { server: url });
  await b.request("login", {
    server: url + "/api",
    email: "test@example.invalid",
    password,
  });
  assert.equal((await b.request("status")).binding, undefined);
  await signIn(b);
  await until(
    async () => (await b.request("status")).binding?.space === space,
    "automatic existing documents connection",
  );
  assert.equal(
    await b.ui("eval", { source: "!!document.querySelector('[role=dialog]')" }),
    false,
  );
  successes.push(
    "Base URL persists and validates; profile opens Nomi account; login automatically connects new or existing documents; changing servers while signed in is rejected",
  );
  // More than one collection needs a choice; cancel leaves the local library untouched.
  const login = await (
    await fetch(url + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.invalid",
        password,
        deviceId: "setup-check",
        deviceName: "Setup check",
      }),
    })
  ).json();
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + login.token,
  };
  assert.equal(
    (
      await fetch(url + "/v1/spaces", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Another collection" }),
      })
    ).status,
    200,
  );
  await fetch(url + "/v1/sessions/" + login.sessionId, {
    method: "DELETE",
    headers,
  });
  const c = await device("mac-c");
  await c.request("configure", { server: url });
  await signIn(c);
  await openAccount(c);
  await click(c, "Continue sign-in");
  await until(
    () =>
      c.ui("eval", {
        source: "!!document.querySelector('[aria-label=\"Cloud documents\"]')",
      }),
    "multiple documents",
  );
  assert.equal(
    await c.ui("eval", {
      source:
        "[...document.querySelectorAll('button,[role=menuitem]')].find(b=>b.textContent==='Continue').disabled",
    }),
    true,
  );
  const beforeCancel = await c.ui("snapshot");
  await click(c, "Cancel");
  assert.equal((await c.request("status")).binding, undefined);
  assert.deepEqual((await c.ui("snapshot")).blocks, beforeCancel.blocks);
  await openAccount(c);
  await click(c, "Continue sign-in");
  await until(
    () =>
      c.ui("eval", {
        source: "!!document.querySelector('[aria-label=\"Cloud documents\"]')",
      }),
    "reopen selection",
  );
  await c.ui("eval", {
    source: `(()=>{const el=document.querySelector('[aria-label="Cloud documents"]');el.value=${JSON.stringify(space)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`,
  });
  await click(c, "Continue");
  await until(
    async () => (await c.request("status")).binding?.space === space,
    "selected connection",
  );
  const deviceList = await a.request("sessions");
  assert.equal(deviceList.filter((d) => d.current).length, 1);
  await a.request("revoke", {
    id: deviceList.find((d) => d.deviceName.includes("mac-c")).id,
  });
  await c.request("sync");
  assert.equal((await c.request("status")).phase, "auth");
  await openAccount(c);
  await until(
    () =>
      c.ui("eval", {
        source:
          "document.querySelector('.workspace-menu-identity')?.textContent.includes('Sign in')",
      }),
    "expired session menu",
  );
  await click(c, "Log out");
  await until(
    async () => !(await c.request("status")).account,
    "expired session sign out",
  );
  assert.equal((await c.request("status")).account, undefined);
  assert.equal((await c.request("status")).server, url);
  await c.request("configure", { server: "https://example.invalid/api" });
  await c.stop();
  successes.push(
    "multiple collections require selection; cancel preserves local data; device API retains current-device/revocation support; menu logout permits URL change",
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
  await a.ui("eval", { source: "location.hash='#/notes?note=note.sync';true" });
  await until(
    () => a.ui("eval", { source: "!!document.querySelector('.notes-scroll')" }),
    "notes undo surface",
  );
  const beforeUndo = await a.ui("snapshot");
  const undo = () =>
    a.ui("eval", {
      source:
        "document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true}));true",
    });
  await undo();
  await delay(100);
  assert.deepEqual((await a.ui("snapshot")).blocks, beforeUndo.blocks);
  await a.ui("edit", { block: "text.two", text: "可撤销的新输入" });
  await undo();
  await until(
    async () =>
      (await a.ui("snapshot")).blocks.find((b) => b.id === "text.two")
        .source === "B 离线编辑第二块",
    "new local undo",
  );
  await writeFile(
    join(a.folder, "library", "文稿", "同步测试.nomi", "text", "text.two.md"),
    "来自外部文件的修改",
  );
  await until(
    async () =>
      (await a.ui("snapshot")).blocks.find((b) => b.id === "text.two")
        .source === "来自外部文件的修改",
    "external file readback",
  );
  await a.request("sync");
  await b.request("sync");
  assert.equal(
    (await b.ui("snapshot")).blocks.find((b) => b.id === "text.two").source,
    "来自外部文件的修改",
  );
  successes.push(
    "remote apply clears stale whole-document Undo, new edits remain undoable, and external Markdown edits synchronize",
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
  await openAccount(b);
  await until(
    () =>
      b.ui("eval", {
        source: "document.body.innerText.includes('Review changes')",
      }),
    "conflict settings",
  );
  await b.ui("eval", {
    source:
      "[...document.querySelectorAll('[role=menuitem]')].find(b=>b.textContent.includes('Review changes')).click();true",
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
  const historyItems = await a.request("historyItems");
  const history = await a.request("history", { id: "text.two" });
  assert.equal(
    history.find((v) => v.version === 1).data.source,
    "另一段文字。",
  );
  await a.request("restore", {
    id: "text.two",
    version: 1,
    expectedVersion: historyItems.blocks.find((b) => b.id === "text.two")
      .version,
    noteId: "note.sync",
  });
  await until(async () => {
    await a.request("sync");
    return (
      (await a.ui("snapshot")).blocks.find((b) => b.id === "text.two")
        .source === "另一段文字。"
    );
  }, "history restore");
  await b.request("sync");
  assert.equal(
    (await b.ui("snapshot")).blocks.find((b) => b.id === "text.two").source,
    "另一段文字。",
  );
  successes.push(
    "history API still restores a previous block as a new synchronized version without an account-panel entry",
  );
  await a.ui("loseAck");
  await a.ui("edit", { block: "text.one", text: "服务端成功但确认丢失" });
  await a.request("sync");
  assert.equal((await a.request("status")).phase, "error");
  await a.ui("edit", { block: "text.one", text: "恢复后新输入" });
  await a.stop();
  await a.launch();
  await until(async () => {
    await a.request("sync");
    return (await a.request("status")).phase === "ready";
  }, "replay lost acknowledgement");
  await b.request("sync");
  assert.equal(
    (await b.ui("snapshot")).blocks.find((b) => b.id === "text.one").source,
    "恢复后新输入",
  );
  const old = await a.request("history", { id: "text.one" });
  assert.equal(
    old.filter((r) => r.data?.source === "服务端成功但确认丢失").length,
    1,
  );
  successes.push(
    "real successful commit with lost response, newer input and process restart replay without duplicates",
  );
  const sessions = await a.request("sessions"),
    deviceB = sessions.find((s) => s.deviceName.includes("mac-b"));
  assert(deviceB);
  await a.request("revoke", { id: deviceB.id });
  await b.request("sync");
  assert.equal((await b.request("status")).phase, "auth");
  await b.ui("edit", { block: "text.two", text: "登录过期仍可编辑" });
  await b.request("login", {
    server: url + "/api",
    email: "test@example.invalid",
    password,
  });
  await b.request("sync");
  successes.push(
    "device revocation pauses sync while local editing survives; reauthentication resumes the same binding",
  );
  await b.stop();
  await b.launch();
  assert.equal(
    (await b.ui("snapshot")).blocks.find((b) => b.id === "text.one").source,
    "恢复后新输入",
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
  const deviceRequests = await a.ui("deviceRequests");
  await openAccount(a);
  assert.equal(
    await a.ui("eval", {
      source:
        "!!document.querySelector('[role=dialog]') || !!document.querySelector('.account-device-row')",
    }),
    false,
  );
  assert.equal(
    await a.ui("eval", {
      source:
        "document.querySelector('.workspace-menu-identity').getAttribute('role')",
    }),
    null,
  );
  assert.equal(
    await a.ui("deviceRequests"),
    deviceRequests,
    "opening menu must not fetch devices",
  );
  successes.push(
    "account identity is static; menu has direct Log out with no account dialog, devices or device fetch",
  );
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
  const beforeLogout = await a.ui("snapshot");
  await click(a, "Log out");
  await until(
    async () => !(await a.request("status")).account,
    "direct menu logout",
  );
  assert.equal((await a.request("status")).enabled, false);
  assert.deepEqual((await a.ui("snapshot")).blocks, beforeLogout.blocks);
  await openAccount(a);
  await until(
    () =>
      a.ui("eval", {
        source:
          "document.querySelector('.workspace-menu-identity')?.textContent.includes('Sign in to Nomi')",
      }),
    "signed out menu",
  );
  assert.equal(
    await a.ui("eval", {
      source:
        "[...document.querySelectorAll('[role=menuitem]')].some(el=>el.textContent==='Log out')",
    }),
    false,
  );
  successes.push(
    "direct menu logout clears identity and disables sync while preserving local documents",
  );
  await writeFile(
    join(output, "desktop-report.json"),
    JSON.stringify(
      { passed: successes, physicalMacs: false, processes: 3, profiles: 3 },
      null,
      2,
    ),
  );
  console.log("PASS: " + successes.join("; "));
} finally {
  await Promise.all(devices.map((d) => d.stop()));
}
