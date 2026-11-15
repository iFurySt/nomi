import {
  app,
  BrowserWindow,
  ipcMain,
  powerMonitor,
  safeStorage,
} from "electron";
import { hostname } from "node:os";
import { join } from "node:path";
import { CloudSyncHost } from "../../../packages/host/src/cloud-sync";
import type { DocumentStore } from "../../../packages/host/src/document-store";
import type { SyncAction } from "../../../packages/core/src/sync/settings";

export async function registerCloudSync(
  store: DocumentStore,
  expected: string,
  invoke: (method: string, params?: unknown) => Promise<unknown>,
  flush: (window: BrowserWindow) => Promise<boolean>,
) {
  const trusted = (
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  ) => {
    const url = event.senderFrame?.url.split("#")[0];
    return (
      event.senderFrame === event.sender.mainFrame &&
      (url === expected ||
        (expected.startsWith("http:") && url === expected + "/"))
    );
  };
  const read = async () => {
    const doc = await store.load("local-device", "document.home");
    if (!doc) throw Error("文稿尚未准备好。");
    return doc;
  };
  let host: CloudSyncHost | undefined;
  let startupError: string | undefined;
  try {
    host = await CloudSyncHost.open({
      folder: join(app.getPath("userData"), "cloud-sync"),
      deviceName: `${hostname()} · ${app.getName()}`,
      codec: {
        encrypt(text) {
          if (
            !safeStorage.isEncryptionAvailable() ||
            (process.platform === "linux" &&
              safeStorage.getSelectedStorageBackend() === "basic_text")
          )
            throw Error("系统安全存储暂不可用，未保存登录信息。");
          return safeStorage.encryptString(text);
        },
        decrypt(bytes) {
          return safeStorage.decryptString(bytes);
        },
      },
      library: async () => (await store.status()).path,
      backup: async () => {
        const doc = await read();
        await store.backup({
          profile: "local-device",
          documentId: doc.id,
          document: doc,
          assets: [],
          baseRevision: doc.revision,
        });
      },
      local: {
        read,
        asset: async (id) =>
          (await store.asset("local-device", "document.home", id))?.bytes,
        apply: async (before, document, assets) => {
          await invoke("sync-apply", { before, document, assets });
        },
      },
    });
  } catch {
    startupError = "同步配置无法读取；本地文稿仍可正常使用。";
  }
  ipcMain.handle(
    "nomi:sync",
    async (event, method: SyncAction, params: unknown) => {
      if (!trusted(event)) throw Error("Sync access denied.");
      if (!host) {
        if (method === "status")
          return {
            enabled: false,
            phase: "off",
            conflicts: 0,
            error: startupError,
          };
        throw Error(startupError);
      }
      const p = params as Record<string, any> | undefined;
      if (method === "status") return host.status;
      if (["bind", "sync", "resolve"].includes(method)) {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window || !(await flush(window)))
          throw Error("请先保存当前文稿。");
      }
      if (method === "login")
        return host.login(p?.server, p?.email, p?.password);
      if (method === "logout") return host.logout();
      if (method === "spaces") return host.spaces();
      if (method === "bind") return host.bind(p?.mode, p?.space);
      if (method === "enabled") {
        if (typeof p?.enabled !== "boolean")
          throw Error("Invalid sync setting");
        return host.enabled(p.enabled);
      }
      if (method === "sync") {
        await host.tick(true);
        return host.status;
      }
      if (method === "conflict") return host.conflict();
      if (method === "resolve") {
        if (
          !p?.choices ||
          typeof p.choices !== "object" ||
          Array.isArray(p.choices) ||
          Object.values(p.choices).some(
            (v) => v !== "local" && v !== "remote",
          ) ||
          (p.structural &&
            p.structural !== "local" &&
            p.structural !== "remote")
        )
          throw Error("冲突选择无效。");
        return host.resolve(p.choices, p.structural);
      }
      if (method === "sessions") return host.sessions();
      if (method === "revoke") {
        if (typeof p?.id !== "string" || p.id.length > 100)
          throw Error("设备无效。");
        return host.revoke(p.id);
      }
      throw Error("Unknown sync action");
    },
  );
  ipcMain.on("nomi:sync-activity", (event) => {
    if (trusted(event)) host?.activity();
  });
  app.on("browser-window-focus", () => host?.focus(true));
  app.on("browser-window-blur", () => host?.focus(false));
  powerMonitor.on("resume", () => host?.wake());
  app.once("will-quit", () => host?.stop());
  ipcMain.on("nomi:sync-online", (event, online) => {
    if (trusted(event) && typeof online === "boolean") host?.online(online);
  });
  host?.start();
  return host;
}
