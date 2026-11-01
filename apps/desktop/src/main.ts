import { setupUpdates } from "./updates";
import { DocumentStore } from "../../../packages/host/src/document-store";
import { registerDocumentStorage } from "./document-ipc";
import { defaultDataDir } from "../../../packages/host/src/data-path";
import { ChatGPTHost } from "../../../packages/host/src/chatgpt";
import { ChatGPTStore } from "../../../packages/host/src/chatgpt-store";
import {
  chatGPTMethods,
  type ChatGPTMethod,
} from "../../../packages/core/src/chatgpt";
import {
  app,
  dialog,
  BrowserWindow,
  ipcMain,
  session,
  Menu,
  nativeImage,
  shell,
} from "electron";
import { join, sep, basename } from "node:path";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { isAppExternalURL } from "../../../packages/core/src/app-links";
import { allowsClipboardWrite } from "../../../packages/host/src/renderer-permissions";
app.setName("Nomi");
const devUrl = process.env.NOMI_DEV_URL;
const updateSmoke = process.argv.includes("--update-smoke");
const smoke = process.argv.includes("--smoke") || updateSmoke;
if (devUrl && devUrl !== "http://127.0.0.1:5173") {
  throw new Error("NOMI_DEV_URL must be the local Nomi development server.");
}
// Smoke checks use a disposable profile, never the user's desktop workspace.
const smokeProfile = smoke
  ? mkdtempSync(join(tmpdir(), "nomi-smoke-"))
  : undefined;
if (smokeProfile) {
  app.setPath("userData", smokeProfile);
  app.once("quit", () => {
    try {
      rmSync(smokeProfile, { recursive: true, force: true });
    } catch {
      /* OS may retain a cache handle until exit. */
    }
  });
}

// A normal installation owns one renderer profile and ChatGPT connection.
// Smoke uses its disposable userData and must not activate the user's window.
const primaryInstance = smoke || app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    } else if (app.isReady()) void createWindow().catch(failStartup);
  });

let documentStore: DocumentStore | undefined;
const pendingPackages: string[] = [];
let openingPackage = false;
app.on("open-file", (event, path) => {
  event.preventDefault();
  pendingPackages.push(path);
  void drainPackages();
});
async function drainPackages() {
  if (!documentStore || openingPackage || !BrowserWindow.getAllWindows().length)
    return;
  openingPackage = true;
  try {
    while (pendingPackages.length) {
      const path = pendingPackages.shift()!;
      try {
        if (!path.endsWith(".nomi")) throw Error("请选择 .nomi 文稿包。");
        const windows = BrowserWindow.getAllWindows();
        if (
          (await Promise.all(windows.map(flushWindowDocuments))).some(
            (ok) => !ok,
          )
        )
          throw Error("请先保存当前文稿，再打开文件包。");
        const owner = windows[0];
        let found = await documentStore.locatePackage(path);
        if (!found) {
          const answer = await dialog.showMessageBox(owner, {
            type: "question",
            message: "将这份文稿包导入文稿库？",
            detail:
              "将创建可编辑的独立副本，包含子文稿和附件。原文件包保持不变。",
            buttons: ["导入独立副本", "取消"],
            defaultId: 0,
            cancelId: 1,
          });
          if (answer.response !== 0) continue;
          const noteId = await documentStore.importPackage(path);
          found = {
            profile: "local-device",
            documentId: "document.home",
            noteId,
          };
        }
        if (found.profile !== "local-device")
          throw Error("请先切换到该文稿所属的本机身份。");
        const hash = found.noteId
          ? "/notes?note=" + encodeURIComponent(found.noteId)
          : "/canvas";
        if (devUrl) await owner.loadURL(devUrl + "#" + hash);
        else
          await owner.loadFile(join(__dirname, "../../web/dist/index.html"), {
            hash,
          });
        owner.show();
        owner.focus();
        app.addRecentDocument(path);
      } catch (error) {
        await dialog.showMessageBox({
          type: "error",
          message: "无法打开文稿包",
          detail: (error as Error).message,
        });
      }
    }
  } finally {
    openingPackage = false;
  }
}
async function choosePackage() {
  const result = await dialog.showOpenDialog({
    title: "打开 Nomi 文稿包",
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "Nomi 文稿", extensions: ["nomi"] }],
  });
  if (!result.canceled && result.filePaths[0]) {
    pendingPackages.push(result.filePaths[0]);
    await drainPackages();
  }
}
let chatGPTHost: ChatGPTHost;
let quitting = false;
let quitPrepared = false;
async function flushWindowDocuments(window: BrowserWindow): Promise<boolean> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return true;
  try {
    return await window.webContents.executeJavaScript(`(async () => {
      const writes = [];
      window.dispatchEvent(new CustomEvent('nomi-flush-documents', {detail: {waitUntil: promise => writes.push(promise)}}));
      return Promise.race([
        Promise.all(writes).then(results => results.every(Boolean)),
        new Promise(resolve => setTimeout(() => resolve(false), 5000)),
      ]);
    })()`);
  } catch {
    return false;
  }
}
app.on("before-quit", (event) => {
  if (quitPrepared || !documentStore) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  void (async () => {
    const windows = BrowserWindow.getAllWindows();
    const saved = await Promise.all(windows.map(flushWindowDocuments));
    if (saved.some((value) => !value)) {
      quitting = false;
      windows.find((_, i) => !saved[i])?.focus();
      return;
    }
    quitPrepared = true;
    try {
      await chatGPTHost?.dispose();
    } finally {
      app.quit();
    }
  })();
});
async function createWindow() {
  const window = new BrowserWindow({
    title: "Nomi",
    icon: join(__dirname, "brand/app-icon.png"),
    width: 1360,
    height: 1000,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: "#f0f0f0",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 14, y: 17 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  let closePrepared = false,
    closePending = false;
  window.on("close", (event) => {
    if (quitPrepared || closePrepared) return;
    event.preventDefault();
    if (closePending) return;
    closePending = true;
    void flushWindowDocuments(window).then((saved) => {
      closePending = false;
      if (saved && !window.isDestroyed()) {
        closePrepared = true;
        window.close();
      } else if (!window.isDestroyed()) window.focus();
    });
  });
  window.webContents.on("destroyed", () => chatGPTHost?.cancelPending(true));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppExternalURL(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  const restrictNavigation = (event: Electron.Event, url: string) => {
    const current = window.webContents.getURL().split("#")[0];
    if (url.split("#")[0] !== current) event.preventDefault();
  };
  window.webContents.on("will-navigate", restrictNavigation);
  window.webContents.on("will-redirect", restrictNavigation);
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Nomi renderer stopped: ${details.reason}`);
    if (smoke) app.exit(1);
  });
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadFile(join(__dirname, "../../web/dist/index.html"));
  if (smoke) {
    const result = await window.webContents.executeJavaScript(`(async () => {
      const waitFor = async check => {const deadline=Date.now()+6000; while(!check()) {if(Date.now()>deadline) throw Error('Renderer did not settle: '+check); await new Promise(r=>setTimeout(r,20));}};
      await waitFor(() => document.querySelector('.canvas-workspace'));
      const updates = await window.nomiDesktop.requestUpdates('status');
      if (${updateSmoke} && !updates.available) throw Error('Sparkle startup failed: '+updates.reason);
      const links = [...document.querySelectorAll('.rail-destinations a')].map(a=>a.getAttribute('href'));
      if(JSON.stringify(links) !== JSON.stringify(['#/canvas','#/notes'])) throw Error('Unexpected main navigation');
      if(window.nomiDesktop.requestData || window.nomiDesktop.requestArena) throw Error('Legacy IPC exposed');
      document.querySelector('a[href="#/notes"]').click();
      await waitFor(()=>document.querySelector('.notes-library') && document.querySelector('.writing-article'));
      const editor = document.querySelector('.writing-article');
      const toggle = document.querySelector('.sidebar-toggle button');
      if(toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      await waitFor(()=>getComputedStyle(document.querySelector('.notes-library')).display !== 'none');
      toggle.click();
      await waitFor(()=>getComputedStyle(document.querySelector('.notes-library')).display === 'none');
      if(editor !== document.querySelector('.writing-article')) throw Error('Fold remounted editor');
      toggle.click();
      await waitFor(()=>getComputedStyle(document.querySelector('.notes-library')).display !== 'none');
      location.hash='/settings';
      await waitFor(()=>document.querySelector('.settings-content'));
      if(document.querySelector('a[href="#/settings/storage"]')) throw Error('Data settings exposed');
      location.hash='/stocks';
      await waitFor(()=>document.querySelector('.canvas-workspace'));
      return {updates,navigation:links,sidebar:true,legacyRouteFallback:true,desktop:(await window.nomiDesktop.getRuntimeInfo()).kind};
    })()`);
    const output = smokeProfile
      ? join(smokeProfile, "verification")
      : join(__dirname, "../../../.artifacts");
    mkdirSync(output, { recursive: true });
    // Wait for the last route/theme transition to paint before taking evidence.
    await window.webContents.executeJavaScript(`(() => {
      const still = document.createElement('style');
      still.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
      document.head.append(still);
    })()`);
    await delay(180);
    await window.webContents.executeJavaScript(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    const screenshot = await window.webContents.capturePage();
    writeFileSync(join(output, "nomi-electron.png"), screenshot.toPNG());
    writeFileSync(
      join(output, "electron-smoke.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(
      "Nomi desktop smoke passed: bundled renderer, isolated bridge, local assets.",
    );
    app.quit();
  }
  return window;
}

const smokeTimeout = smoke
  ? setTimeout(() => {
      console.error("Desktop smoke timed out.");
      app.exit(1);
    }, 15000)
  : undefined;
if (primaryInstance)
  void app
    .whenReady()
    .then(async () => {
      const iconPath = join(__dirname, "brand/app-icon.png");
      const brandIcon = nativeImage.createFromPath(iconPath);
      if (brandIcon.isEmpty()) throw Error("Nomi app icon is unavailable.");
      app.dock?.setIcon(brandIcon);
      app.setAboutPanelOptions({
        applicationName: "Nomi",
        applicationVersion: app.getVersion(),
        iconPath,
      });
      const updates = setupUpdates(
        devUrl ||
          pathToFileURL(join(__dirname, "../../web/dist/index.html")).href,
        flushWindowDocuments,
        app.isPackaged &&
          !devUrl &&
          (!smoke || updateSmoke) &&
          !process.execPath.includes("/apps/desktop/dist/Nomi.app/"),
      );
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === "darwin"
            ? [
                {
                  label: "Nomi",
                  submenu: [
                    { role: "about" as const },
                    {
                      label: "检查更新…",
                      click: async () => {
                        const window =
                          BrowserWindow.getAllWindows()[0] ??
                          (await createWindow());
                        if (window) {
                          window.show();
                          window.focus();
                          await window.webContents.executeJavaScript(
                            "location.hash = '/settings/general'",
                          );
                        }
                        updates.check();
                      },
                    },
                    { type: "separator" as const },
                    { role: "services" as const },
                    { type: "separator" as const },
                    { role: "hide" as const },
                    { role: "hideOthers" as const },
                    { role: "unhide" as const },
                    { type: "separator" as const },
                    { role: "quit" as const },
                  ],
                },
              ]
            : []),
          {
            label: "File",
            submenu: [
              {
                label: "打开文稿包…",
                accelerator: "CmdOrCtrl+O",
                click: () => {
                  void choosePackage();
                },
              },
              { role: "close" },
            ],
          },
          { role: "editMenu" },
          { role: "viewMenu" },
          { role: "windowMenu" },
        ]),
      );
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) =>
          callback(
            allowsClipboardWrite(permission, {
              ...details,
              mainFrameUrl: contents.mainFrame.url,
              expectedUrl:
                devUrl ||
                pathToFileURL(join(__dirname, "../../web/dist/index.html"))
                  .href,
            }),
          ),
      );
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission, _origin, details) =>
          !!contents &&
          allowsClipboardWrite(permission, {
            ...details,
            mainFrameUrl: contents.mainFrame.url,
            expectedUrl:
              devUrl ||
              pathToFileURL(join(__dirname, "../../web/dist/index.html")).href,
          }),
      );
      const assetRoot = realpathSync(join(__dirname, "../../web/dist"));
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["<all_urls>"] },
        (details, callback) => {
          let allowed = false;
          try {
            const target = new URL(details.url);
            if (
              devUrl &&
              ["http://127.0.0.1:5173", "ws://127.0.0.1:5173"].includes(
                target.origin,
              )
            )
              allowed = true;
            else if (!devUrl && target.protocol === "file:") {
              const path = realpathSync(fileURLToPath(target));
              allowed =
                path.startsWith(assetRoot + sep) &&
                !path.split(sep).includes("chatgpt") &&
                !basename(path).startsWith("nomi-vault.") &&
                !/\.sqlite(?:-wal|-shm)?$/.test(path);
            } else if (target.protocol === "data:") allowed = true;
          } catch {
            /* Invalid or out-of-scope resources remain denied. */
          }
          callback({ cancel: !allowed });
        },
      );
      const documents = new DocumentStore(
        join(app.getPath("userData"), "document-directory.json"),
        smokeProfile
          ? join(smokeProfile, "Documents", "Nomi")
          : join(app.getPath("documents"), "Nomi"),
      );
      documentStore = documents;
      registerDocumentStorage(
        documents,
        devUrl ||
          pathToFileURL(join(__dirname, "../../web/dist/index.html")).href,
        flushWindowDocuments,
      );
      ipcMain.handle("nomi:runtime-info", () => ({
        kind: "desktop",
        version: app.getVersion(),
        platform: process.platform,
      }));
      chatGPTHost = new ChatGPTHost(
        new ChatGPTStore(
          smokeProfile ? join(smokeProfile, "data") : defaultDataDir(),
        ),
        (url) => shell.openExternal(url),
      );
      ipcMain.handle(
        "nomi:chatgpt",
        async (event, method: ChatGPTMethod, params?: unknown) => {
          const frame = event.senderFrame;
          const url = frame?.url.split("#")[0];
          const expected =
            devUrl ||
            pathToFileURL(join(__dirname, "../../web/dist/index.html")).href;
          if (
            frame !== event.sender.mainFrame ||
            (devUrl
              ? url !== expected && url !== expected + "/"
              : url !== expected) ||
            !chatGPTMethods.includes(method)
          )
            return { ok: false, error: "ChatGPT access denied." };
          try {
            const value = await chatGPTHost.request(method, params, (delta) => {
              if (
                !event.sender.isDestroyed() &&
                event.senderFrame === event.sender.mainFrame
              )
                event.sender.send("nomi:chatgpt-delta", delta);
            });
            return { ok: true, value };
          } catch (error) {
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "ChatGPT request failed.",
            };
          }
        },
      );
      await createWindow();
      await drainPackages();
      if (smokeTimeout) clearTimeout(smokeTimeout);
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
          void createWindow().catch(failStartup);
      });
    })
    .catch(failStartup);
function failStartup(error: unknown) {
  console.error("Nomi could not start:", error);
  app.exit(1);
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smoke) app.quit();
});
