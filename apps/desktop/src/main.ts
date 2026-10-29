import { ArenaHost, arenaAgentFactory } from "../../../packages/host/src/arena";
import {
  arenaMethods,
  type ArenaMethod,
} from "../../../packages/core/src/arena";
import { DataHost } from "../../../packages/host/src/runtime";
import { defaultDataDir } from "../../../packages/host/src/runtime";
import { ChatGPTHost } from "../../../packages/host/src/chatgpt";
import { CodexRuntime } from "../../../packages/host/src/codex-runtime";
import { ChatGPTStore } from "../../../packages/host/src/chatgpt-store";
import {
  chatGPTMethods,
  type ChatGPTMethod,
} from "../../../packages/core/src/chatgpt";
import {
  dataMethods,
  type DataMethod,
} from "../../../packages/core/src/data-service";
import {
  app,
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
const smoke = process.argv.includes("--smoke");
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

let dataHost: DataHost;
let chatGPTHost: ChatGPTHost;
let arenaHost: ArenaHost;
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
  if (quitPrepared || !dataHost) return;
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
      await arenaHost?.dispose();
      await chatGPTHost?.dispose();
    } finally {
      await dataHost.stop();
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
      const runtime = await window.nomiDesktop?.getRuntimeInfo();
      const waitFor = async (check) => {
        const deadline = Date.now() + 4000;
        while (!check()) { if (Date.now() > deadline) throw Error('Renderer did not settle: ' + check.toString()); await new Promise(resolve => setTimeout(resolve, 20)); }
      };
      await waitFor(() => !!document.querySelector('.canvas-workspace') && document.documentElement.dataset.runtime === 'desktop');
      const canvasWorkspace = document.querySelectorAll('[data-placement]').length >= 3;
      const initialHistory = document.querySelector('[aria-label="Go back"]').disabled && document.querySelector('[aria-label="Go forward"]').disabled;
      for (let visit = 0; visit < 2; visit++) {
        document.querySelector('a[href="#/notes"]').click();
        await waitFor(() => !!document.querySelector('.tiptap') && !!document.querySelector('[aria-label="拖动当前块"]'));
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!document.querySelector('.notes-workspace')) throw Error('Notes editor disappeared after mount');
        document.querySelector('a[href="#/canvas"]').click();
        await waitFor(() => !!document.querySelector('.canvas-workspace'));
      }
      const notesLifecycle = true;
      document.querySelector('.rail-destinations a[href^="#/stocks/"]').click();
      await waitFor(() => !!document.querySelector('.stocks-page'));
      document.querySelector('a[href="#/watchlist"]').click();
      await waitFor(() => !!document.querySelector('.watchlist-table'));
      const navigation = document.querySelectorAll('.watchlist-table tbody tr').length === 5;
      const back = document.querySelector('[aria-label="Go back"]');
      await waitFor(() => !back.disabled);
      back.click();
      await waitFor(() => !!document.querySelector('.stocks-page'));
      const forward = document.querySelector('[aria-label="Go forward"]');
      await waitFor(() => !forward.disabled);
      forward.click();
      await waitFor(() => !!document.querySelector('.watchlist-table'));
      const historyControls = !document.querySelector('[aria-label="Go back"]').disabled;
      back.click();
      await waitFor(() => !!document.querySelector('.stocks-page'));
      document.querySelector('a[href="#/library"]').click();
      await waitFor(() => !!document.querySelector('.library-grid') && document.querySelector('[aria-label="Go forward"]').disabled);
      const branchingHistory = document.querySelector('[aria-label="Go forward"]').disabled;
      document.querySelector('[aria-label="Collapse sidebar"]').click();
      await waitFor(() => getComputedStyle(document.querySelector('.sidebar')).display === 'none');
      document.querySelector('[aria-label="Expand sidebar"]').click();
      await waitFor(() => getComputedStyle(document.querySelector('.sidebar')).display !== 'none');
      const framedShell = !!document.querySelector('.window-toolbar') && getComputedStyle(document.querySelector('.workspace-panel')).borderTopLeftRadius === '16px';
      document.querySelector('[aria-label="Switch to dark theme"]').click();
      await waitFor(() => document.documentElement.dataset.theme === 'dark' && !!localStorage.getItem('nomi.workspace.v1'));
      const localSave = JSON.parse(localStorage.getItem('nomi.workspace.v1')).theme === 'dark';
      document.querySelector('[aria-label="Switch to light theme"]').click();
      document.querySelector('.rail-destinations a[href^="#/stocks/"]').click();
      await waitFor(() => !!document.querySelector('.stocks-page') && document.documentElement.dataset.theme === 'light');
      const stockTabs = [...document.querySelectorAll('[role="tab"]')].map(el => el.textContent).join(',') === 'Chart,Financials,Funds,Politicians,Insiders,Analyst';
      const railLinks = [...document.querySelectorAll('.rail-destinations a')];
      const stockSidebar = !!document.querySelector('.stock-sidebar') &&
        railLinks.some(link => link.getAttribute('href')?.startsWith('#/stocks/')) &&
        ['research','agents','watchlist','arena','portfolio','library'].every(page =>
          railLinks.some(link => link.getAttribute('href') === '#/' + page));
      document.querySelector('[role="tab"][id="stock-tab-funds"]').click();
      await waitFor(() => !!document.querySelector('#stock-panel-funds .stock-table-empty'));
      const stockPlaceholders = !!document.querySelector('#stock-panel-funds .stock-table-empty') && !document.body.innerText.includes('Sample financials');
      document.querySelector('[role="tab"][id="stock-tab-chart"]').click();
      await waitFor(() => !!document.querySelector('#stock-panel-chart .stock-chart-panel'));
 const cachedResearch=await window.nomiDesktop.requestData('research.read',{symbol:'AAPL'});
 if(cachedResearch.bars.length!==0 || document.querySelector('.stock-price-chart') || !document.querySelector('.stock-quote').innerText.includes('—')) throw Error('Research fixtures leaked into an empty store');
      const directoryPage = await window.nomiDesktop.requestData('directory.list', {query:'',limit:50,offset:0});
      const directoryLookup = await window.nomiDesktop.requestData('directory.get', {symbol:'AAPL'});
      await waitFor(() => document.querySelector('.stock-list')?.getAttribute('aria-busy') === 'false');
      const directoryReads = directoryPage.total === 0 && directoryPage.items.length === 0 && directoryLookup.item === null && document.querySelector('.stock-list').innerText.includes('No directory yet') && document.querySelector('.stock-company-header h1').textContent === 'AAPL';
      const sp = await window.nomiDesktop.requestData('directory.list', {query:'',limit:50,offset:0,collection:'sp500'});
      const ndx = await window.nomiDesktop.requestData('directory.list', {query:'',limit:50,offset:0,collection:'nasdaq100'});
      let protectedMembership = false;
      try { await window.nomiDesktop.requestData('directory.list', {query:'',limit:50,offset:0,collection:'sp500',symbols:['AAPL']}); } catch { protectedMembership = true; }
      const openCollections = () => document.querySelector('[aria-label="Stock collection"]').click();
      openCollections();
      await waitFor(() => document.querySelectorAll('[role="option"]').length === 4);
      const collectionOptions = [...document.querySelectorAll('[role="option"]')];
      const labels = collectionOptions.map(el => el.textContent).join(',');
      collectionOptions.find(el => el.textContent === 'S&P 500').click();
      await waitFor(() => document.querySelector('[aria-label="Stock collection"]').textContent.trim() === 'S&P 500' && document.querySelector('.stock-list').getAttribute('aria-busy') === 'false' && !document.querySelector('[role="option"]'));
      const selectionSaved = localStorage.getItem('nomi.stock-collection.v1') === 'sp500';
      openCollections();
      await waitFor(() => document.querySelectorAll('[role="option"]').length === 4);
      [...document.querySelectorAll('[role="option"]')].find(el => el.textContent === 'All US listings').click();
      await waitFor(() => document.querySelector('[aria-label="Stock collection"]').textContent.trim() === 'Stocks' && document.querySelector('.stock-list').getAttribute('aria-busy') === 'false');
      const stockCollections = labels === 'All US listings,S&P 500,Nasdaq-100,My watchlist' && selectionSaved && protectedMembership && sp.total === 0 && sp.collection.memberCount >= 500 && sp.collection.unresolvedSymbols.length === sp.collection.memberCount && ndx.collection.memberCount >= 100 && ndx.collection.unresolvedSymbols.length === ndx.collection.memberCount;
      const hiddenScrollbars = getComputedStyle(document.querySelector('.stock-list')).scrollbarWidth === 'none' && getComputedStyle(document.querySelector('.main-content')).scrollbarWidth === 'none';
      const initialData = await window.nomiDesktop.requestData('status');
      const saved = await window.nomiDesktop.requestData('settings.save', {...initialData.settings, intervalHours:6, automatic:false});
      await window.nomiDesktop.requestData('credentials.set', {provider:'massive',values:{apiKey:'synthetic-native-test-key'}});
      const configured = await window.nomiDesktop.requestData('status');
      const dataService = configured.settings.intervalHours === 6 && !configured.settings.automatic && configured.offline === true;
      let privateFilesBlocked = false;
      try { await fetch('file://' + configured.dataDir + '/nomi-vault.key'); } catch { privateFilesBlocked = true; }
      const credentials = privateFilesBlocked && configured.credentials.some(x => x.provider === 'massive') && !JSON.stringify(configured).includes('synthetic-native-test-key');
      await window.nomiDesktop.requestData('credentials.remove', {provider:'massive'});
      const researchStatus=await window.nomiDesktop.requestData('research.status');
 if(researchStatus.universe!==0 || researchStatus.priced!==0) throw Error('Research coverage is invented');
 location.hash = '/settings/keys';
 await waitFor(()=>!!document.querySelector('.settings-content') && document.querySelector('.settings-content').innerText.includes('Financial Modeling Prep'));
 location.hash = '/settings/sync';
      await waitFor(() => !!document.querySelector('.settings-content') && document.querySelector('[aria-label="Directory interval hours"]')?.value === '6');
      const settingsUI = document.querySelectorAll('[aria-label="Settings categories"] a').length === 6;
      location.hash = '/settings/chatgpt';
      await waitFor(() => !!document.querySelector('[aria-label="ChatGPT accounts"]') && document.querySelector('.settings-content')?.innerText.includes('Sign in with ChatGPT'));
      const chatStatus = await window.nomiDesktop.requestChatGPT('status');
      const deniedChat = await window.nomiDesktop.requestChatGPT('read-token');
      const invalidChat = await window.nomiDesktop.requestChatGPT('respond', {url:'https://other.invalid'});
      const chatGPT = chatStatus.ok && chatStatus.value.profiles.length === 0 && !deniedChat.ok && !invalidChat.ok &&
        !JSON.stringify(chatStatus.value).includes('Token') && !document.querySelector('.chatgpt-usage-link');
      document.querySelector('.rail-destinations a[href="#/learn"]').click();
      await waitFor(() => document.querySelectorAll('.learning-plot path[data-series]').length === 3);
      const learning = document.querySelector('[data-probability="0"]').textContent === '70.66%' && getComputedStyle(document.querySelector('.sidebar')).display === 'none';
      location.hash='/settings';
      await waitFor(() => !!document.querySelector('.settings-content'));
      const brand = document.querySelector('.brand-mark');
      const maskImage = brand && getComputedStyle(brand).maskImage;
      const maskURL = maskImage?.startsWith('url(') ? maskImage.slice(4, -1).replaceAll('"', '').replaceAll("'", '') : null;
      const brandLoaded = maskURL ? await new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = maskURL; }) : false;
      const branding = document.title === 'Nomi' && !!brand && brandLoaded && brand.getBoundingClientRect().width > 0;
      return { runtime, canvasWorkspace, notesLifecycle, learning, branding, directoryReads, stockCollections, hiddenScrollbars, dataService, credentials, settingsUI, chatGPT, stockTabs, stockSidebar, stockPlaceholders, navigation, initialHistory, historyControls, branchingHistory, framedShell, localSave, isolated: typeof require === 'undefined',
        rendered: !!document.querySelector('.settings-content'),
        theme: document.documentElement.dataset.theme,
        desktop: document.documentElement.dataset.runtime,
        externalAssets: [...document.querySelectorAll('script[src],link[href]')]
          .some(el => /^https?:/.test(el.getAttribute('src') || el.getAttribute('href') || '')) };
    })()`);
    if (
      result.runtime?.kind !== "desktop" ||
      !result.isolated ||
      !result.branding ||
      !result.learning ||
      !result.canvasWorkspace ||
      !result.notesLifecycle ||
      !result.navigation ||
      !result.dataService ||
      !result.directoryReads ||
      !result.credentials ||
      !result.settingsUI ||
      !result.chatGPT ||
      !result.stockTabs ||
      !result.stockSidebar ||
      !result.stockCollections ||
      !result.hiddenScrollbars ||
      !result.stockPlaceholders ||
      !result.initialHistory ||
      !result.historyControls ||
      !result.branchingHistory ||
      !result.framedShell ||
      !result.localSave ||
      !result.rendered ||
      result.desktop !== "desktop" ||
      result.externalAssets
    ) {
      throw new Error(`Desktop smoke check failed: ${JSON.stringify(result)}`);
    }
    const output = join(__dirname, "../../../.artifacts");
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
      JSON.stringify({ ...result, goPid: dataHost.pid }, null, 2),
    );
    console.log(
      "Nomi desktop smoke passed: bundled renderer, isolated bridge, local assets.",
    );
    app.quit();
  }
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
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === "darwin"
            ? [
                {
                  label: "Nomi",
                  submenu: [
                    { role: "about" as const },
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
          { role: "fileMenu" },
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
      ipcMain.handle("nomi:runtime-info", () => ({
        kind: "desktop",
        version: app.getVersion(),
        platform: process.platform,
      }));
      dataHost = new DataHost(
        join(__dirname, process.platform === "win32" ? "nomi.exe" : "nomi"),
        smokeProfile ? join(smokeProfile, "data") : undefined,
        smoke,
        async (path, directory) => {
          if (directory) {
            const error = await shell.openPath(path);
            if (error) throw Error("Could not open the data directory.");
          } else shell.showItemInFolder(path);
        },
      );
      chatGPTHost = new ChatGPTHost(
        new ChatGPTStore(
          smokeProfile ? join(smokeProfile, "data") : defaultDataDir(),
        ),
        (url) => shell.openExternal(url),
        undefined,
        (record) => dataHost!.recordUsage(record),
        new CodexRuntime(
          join(
            __dirname,
            "codex",
            "bin",
            process.platform === "win32" ? "codex.exe" : "codex",
          ),
          join(
            smokeProfile ? join(smokeProfile, "data") : defaultDataDir(),
            "agent",
          ),
          undefined,
          undefined,
          {
            binary: join(
              __dirname,
              process.platform === "win32" ? "nomi.exe" : "nomi",
            ),
            dataDir: smokeProfile
              ? join(smokeProfile, "data")
              : defaultDataDir(),
          },
        ),
      );
      arenaHost = new ArenaHost(
        dataHost,
        chatGPTHost,
        arenaAgentFactory(
          join(
            __dirname,
            "codex",
            "bin",
            process.platform === "win32" ? "codex.exe" : "codex",
          ),
          join(__dirname, process.platform === "win32" ? "nomi.exe" : "nomi"),
          smokeProfile ? join(smokeProfile, "data") : defaultDataDir(),
        ),
        (delta) => {
          for (const window of BrowserWindow.getAllWindows())
            if (!window.webContents.isDestroyed())
              window.webContents.send("nomi:chatgpt-delta", delta);
        },
      );
      ipcMain.handle(
        "nomi:arena",
        async (event, method: ArenaMethod, params?: unknown) => {
          const frame = event.senderFrame,
            url = frame?.url.split("#")[0],
            expected =
              devUrl ||
              pathToFileURL(join(__dirname, "../../web/dist/index.html")).href;
          if (
            frame !== event.sender.mainFrame ||
            (url !== expected && !(devUrl && url === expected + "/")) ||
            !arenaMethods.includes(method)
          )
            return { ok: false, error: "Arena access denied." };
          try {
            const value = await arenaHost.request(method, params, (delta) => {
              if (!event.sender.isDestroyed())
                event.sender.send("nomi:chatgpt-delta", delta);
            });
            return { ok: true, value };
          } catch (error) {
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Arena session failed.",
            };
          }
        },
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
      try {
        await dataHost.start();
        await arenaHost.recover();
      } catch {
        console.error("Nomi data service could not start.");
      }
      ipcMain.handle(
        "nomi:data",
        (event, method: DataMethod, params?: unknown) => {
          const frame = event.senderFrame;
          const url = frame?.url.split("#")[0];
          const expected =
            devUrl ||
            pathToFileURL(join(__dirname, "../../web/dist/index.html")).href;
          if (
            frame !== event.sender.mainFrame ||
            (devUrl
              ? url !== expected + "/" && url !== expected
              : url !== expected) ||
            !dataMethods.includes(method)
          )
            throw Error("Data access denied.");
          return dataHost.request(method, params);
        },
      );
      await createWindow();
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
