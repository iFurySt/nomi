import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/mcp");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-")),
  connection = join(output, "profile/mcp/connection.json");
const main = `
const {app,BrowserWindow,ipcMain,Menu}=require('electron');
const {DocumentStore}=require(${JSON.stringify(join(root, "packages/host/src/document-store.ts"))});
const {registerDocumentStorage}=require(${JSON.stringify(join(root, "apps/desktop/src/document-ipc.ts"))});
const {registerAutomation}=require(${JSON.stringify(join(root, "apps/desktop/src/automation.ts"))});
const {pathToFileURL}=require('node:url');const path=require('node:path'),fs=require('node:fs/promises');
const output=${JSON.stringify(output)};app.setName('Nomi(Dev) MCP verification');app.setPath('userData',path.join(output,'profile'));
let win, copiedText; require("electron").clipboard.writeText = text => { copiedText = text; };
process.on('message',async message=>{try{let value;if(message.action==='eval')value=await win.webContents.executeJavaScript(message.source,true);else if(message.action==='capture'){await fs.writeFile(message.path,(await win.webContents.capturePage()).toPNG());value=true;}else if(message.action==='undo'){win.webContents.sendInputEvent({type:'keyDown',keyCode:'z',modifiers:['meta']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'z',modifiers:['meta']});value=true;}else if(message.action==='menu')value=Menu.getApplicationMenu().items.map(i=>i.label);else if(message.action==='clipboard')value=copiedText;else if(message.action==='quit'){win.destroy();app.quit();return;}process.send({id:message.id,value});}catch(e){process.send({id:message.id,error:e.message});}});
app.whenReady().then(async()=>{
const store=new DocumentStore(path.join(output,'directory.json'),path.join(output,'library'));
const url=pathToFileURL(${JSON.stringify(join(root, "apps/web/dist/index.html"))}).href;
registerDocumentStorage(store,url,async w=>w.webContents.executeJavaScript('(async()=>{const writes=[];window.dispatchEvent(new CustomEvent("nomi-flush-documents",{detail:{waitUntil:p=>writes.push(p)}}));return (await Promise.all(writes)).every(Boolean)})()'));
ipcMain.handle('nomi:runtime-info',()=>({kind:'desktop',platform:process.platform,version:'fixture'}));
ipcMain.handle('nomi:updates',()=>({version:'fixture',available:false,reason:'Disabled'}));
ipcMain.handle('nomi:chatgpt',()=>({ok:false,error:'No fixture account'}));
Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'editMenu'}]));
win=new BrowserWindow({width:1250,height:850,show:false,webPreferences:{preload:${JSON.stringify(join(root, "apps/desktop/dist/preload.cjs"))},sandbox:true,contextIsolation:true,nodeIntegration:false}});
await win.loadURL(url);await registerAutomation(store,url);process.send({ready:true});
}).catch(e=>{console.error(e);app.exit(1)});
`;
await build({
  stdin: { contents: main, resolveDir: root, sourcefile: "mcp-smoke.ts" },
  outfile: join(output, "main.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
let child;
let serial = 0;
const pending = new Map();
async function launch() {
  child = spawn(require("electron"), [join(output, "main.cjs")], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "", NOMI_MCP: "1" },
  });
  child.stderr.on("data", (b) => {
    const s = b.toString();
    if (
      !s.includes("WARNING") &&
      !s.includes("ERROR:CONSOLE") &&
      !s.includes("property cache")
    )
      process.stderr.write(s);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Electron readiness timeout")),
      20000,
    );
    child.on("message", (m) => {
      if (m.ready) {
        clearTimeout(timer);
        resolve();
      } else if (pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p.reject(Error(m.error)) : p.resolve(m.value);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Electron exited ${code}`));
    });
  });
}
function ui(action, fields = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.send({ id, action, ...fields });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const done = new Promise((r) => child.once("exit", r));
  child.send({ action: "quit" });
  await done;
}
let client, transport;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  let last;
  for (let i = 0; i < 100; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await delay(50);
  }
  throw last ?? Error("Timeout waiting for expected state");
}
const successes = [];
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw Error(result.content[0].text);
  return JSON.parse(result.content[0].text);
}
try {
  await launch();
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "apps/mcp/dist/main.mjs"), "--connection", connection],
    stderr: "pipe",
  });
  client = new Client({ name: "nomi-verification", version: "1" });
  await client.connect(transport);
  const list = await client.listTools();
  assert(list.tools.length >= 25);
  assert(
    (
      await client.readResource({ uri: "nomi://guide" })
    ).contents[0].text.includes("expectedRevision"),
  );
  const context = await until(() => call("get_context"));
  let revision = context.revision;
  const scope = { workspaceId: context.workspaceId };
  const write = async (name, args) => {
    const result = await call(name, {
      ...scope,
      expectedRevision: revision,
      requestId: `test-${++serial}`,
      ...args,
    });
    revision = result.revision;
    return result;
  };
  const created = await write("create_note", {
    noteId: "note.mcp",
    title: "MCP 验证",
    markdown: "Alpha unique phrase Omega",
  });
  const blockId = created.operations[0].blockIds[0];
  await call("open_note", { ...scope, noteId: "note.mcp", blockId });
  await until(() =>
    ui("eval", {
      source: 'document.body.innerText.includes("Alpha unique phrase Omega")',
    }),
  );
  successes.push("stdio discovery, native App create/read/open");
  await ui("eval", {
    source: `(()=>{const el=document.querySelector('[data-writing-block="${blockId}"] .tiptap p');const node=el.firstChild;const range=document.createRange();range.setStart(node,6);range.setEnd(node,19);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);return true;})()`,
  });
  const selection = await call("get_context", { includeSelection: true });
  assert.equal(selection.selection.text, "unique phrase");
  assert.equal(selection.selection.blockId, blockId);
  successes.push("live selection and surrounding context");
  const args = {
    ...scope,
    expectedRevision: revision,
    requestId: "deduplicate",
    blockId,
    oldText: "unique phrase",
    newText: "MCP edited",
  };
  const edited = await call("edit_text", args);
  revision = edited.revision;
  assert.deepEqual(await call("edit_text", args), edited);
  await until(() =>
    ui("eval", {
      source: 'document.body.innerText.includes("Alpha MCP edited Omega")',
    }),
  );
  await assert.rejects(
    () => call("edit_text", { ...args, requestId: "stale" }),
    /REVISION_CONFLICT/,
  );
  successes.push(
    "precise edit, persistent idempotency and stale revision rejection",
  );
  await ui("eval", {
    source: `(()=>{const el=document.querySelector('[data-writing-block="${blockId}"] .tiptap');el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('insertText',false,' LOCAL');return true;})()`,
  });
  const local = await call("get_context");
  assert(local.revision > revision);
  revision = local.revision;
  const read = await call("get_block", { ...scope, blockId });
  assert(read.block.source.includes("LOCAL"));
  successes.push("local editor writes preserved and flushed before MCP reads");
  const modified = await write("edit_text", {
    blockId,
    oldText: "MCP edited",
    newText: "Remote update",
  });
  await ui("eval", { source: "document.activeElement?.blur();true" });
  await ui("undo");
  await until(async () => {
    const b = await call("get_block", { ...scope, blockId });
    return (
      b.block.source.includes("MCP edited") && b.block.source.includes("LOCAL")
    );
  });
  revision = (await call("get_context")).revision;
  successes.push("one native undo restores MCP edit and preserves local input");
  const batch = await write("apply_changes", {
    operations: [
      {
        type: "create_note",
        noteId: "note.child",
        parentId: "note.mcp",
        title: "Child",
        markdown: "Child body",
      },
      {
        type: "insert_blocks",
        noteId: "note.mcp",
        blocks: [
          { id: "block.extra", type: "markdown", source: "Extra content" },
        ],
      },
      {
        type: "move_blocks",
        noteId: "note.mcp",
        targetNoteId: "note.child",
        blockIds: ["block.extra"],
      },
    ],
  });
  assert(batch.operations.length === 3);
  await assert.rejects(
    () => write("trash_note", { noteId: "note.mcp", includeChildren: false }),
    /HAS_CHILDREN/,
  );
  const trash = await write("trash_note", {
    noteId: "note.mcp",
    includeChildren: true,
  });
  await stop();
  await launch();
  await until(() => call("get_context"));
  revision = (await call("get_context")).revision;
  const trashList = await call("list_trash", scope);
  assert(trashList.items.some((i) => i.id === trash.changeId));
  await write("restore_note", { changeId: trash.changeId });
  const restored = await call("get_note", {
    ...scope,
    noteId: "note.mcp",
    includeBlocks: true,
  });
  assert(restored.children.includes("note.child"));
  assert(restored.blocks.some((b) => b.source?.includes("LOCAL")));
  successes.push(
    "subtree trash/restore survives a full desktop process restart",
  );
  const sample = join(output, "sample.txt");
  await writeFile(sample, "binary attachment roundtrip");
  const asset = await write("import_asset", {
    path: sample,
    noteId: "note.mcp",
  });
  assert.equal(
    Buffer.from(
      (await call("read_asset", { ...scope, assetId: asset.assetId })).base64,
      "base64",
    ).toString(),
    "binary attachment roundtrip",
  );
  const exported = join(output, "export");
  await call("export_note", {
    ...scope,
    noteId: "note.mcp",
    path: exported,
    format: "markdown",
    includeChildren: true,
  });
  const imported = await write("import_note", {
    path: join(exported, "MCP 验证.nomi"),
    format: "nomi",
    title: "Imported MCP",
  });
  assert(imported.noteIds.length === 2);
  successes.push("attachment bytes and nested portable package export/import");
  await call("open_note", { ...scope, noteId: "note.mcp", blockId });
  await ui("capture", { path: join(reports, "mcp-desktop.png") });
  const roTransport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(root, "apps/mcp/dist/main.mjs"),
      "--connection",
      connection,
      "--read-only",
    ],
  });
  const ro = new Client({ name: "read-only-test", version: "1" });
  await ro.connect(roTransport);
  try {
    assert(!(await ro.listTools()).tools.some((t) => t.name === "create_note"));
    const denied = await ro.callTool({
      name: "create_note",
      arguments: {
        ...scope,
        expectedRevision: revision,
        requestId: "denied",
        title: "Forbidden",
      },
    });
    assert(denied.isError);
  } finally {
    await ro.close();
  }
  successes.push("read-only adapter rejects hidden write tools");
  assert(!(await ui("menu")).includes("MCP"));
  await ui("eval", { source: 'location.hash="/settings/mcp";true' });
  await until(() =>
    ui("eval", {
      source: `!!document.querySelector('[aria-label="启用 MCP"]:not(:disabled)')`,
    }),
  );
  const setting = (method, value) =>
    ui("eval", {
      source: `window.nomiDesktop.requestAutomationSettings(${JSON.stringify(method)},${JSON.stringify(value)})`,
    });
  await assert.rejects(() => setting("enabled", "yes"), /Invalid MCP setting/);
  await assert.rejects(() => setting("unknown"), /Invalid MCP setting/);
  await ui("eval", {
    source: `document.querySelector('[aria-label="仅允许读取"]').click();true`,
  });
  await until(() =>
    ui("eval", {
      source: `!!document.querySelector('[aria-label="仅允许读取"][aria-checked="true"]:not(:disabled)')`,
    }),
  );
  await assert.rejects(
    () => write("create_note", { title: "Forbidden by settings" }),
    /READ_ONLY/,
  );
  await ui("eval", {
    source:
      '[...document.querySelectorAll("button")].find(b=>b.textContent.includes("复制配置")).click();true',
  });
  await until(() =>
    ui("eval", { source: 'document.body.innerText.includes("已复制")' }),
  );
  const copiedConfig = JSON.parse(await ui("clipboard"));
  assert.equal(copiedConfig.mcpServers.nomi.args.at(-1), connection);
  assert(!JSON.stringify(copiedConfig).includes("token"));
  await ui("capture", { path: join(reports, "mcp-settings.png") });
  await stop();
  await launch();
  assert.equal((await setting("status")).readOnly, true);
  await setting("enabled", false);
  await assert.rejects(() => readFile(connection), /ENOENT/);
  await setting("enabled", true);
  await setting("readOnly", false);
  assert.equal((await call("get_context")).readOnly, false);
  successes.push(
    "Settings page toggles, persistence, read-only enforcement, copy config and no top menu",
  );
  await writeFile(
    join(reports, "result.json"),
    JSON.stringify({ tools: list.tools.length, checks: successes }, null, 2),
  );
  console.log(
    `MCP Electron smoke passed: ${successes.length} scenarios, ${list.tools.length} tools.`,
  );
} finally {
  await client?.close();
  await stop();
}
