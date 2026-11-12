import { app, BrowserWindow, ipcMain, clipboard, nativeImage } from "electron";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  AutomationService,
  type AutomationSnapshot,
} from "../../../packages/host/src/automation-service";
import { startAutomationServer } from "../../../packages/host/src/automation-server";
import {
  atomicFile,
  regularFile,
} from "../../../packages/host/src/document-files";
import type { DocumentStore } from "../../../packages/host/src/document-store";
import type { DocumentAssetBytes } from "../../../packages/core/src/document-storage";
import { readOnlyTools } from "../../../packages/core/src/automation/contract";
export async function registerAutomation(
  store: DocumentStore,
  expectedURL: string,
) {
  const folder = join(app.getPath("userData"), "mcp"),
    config = join(app.getPath("userData"), "mcp-settings.json"),
    connectionFile = join(folder, "connection.json");
  let listener: Awaited<ReturnType<typeof startAutomationServer>> | undefined;
  const pending = new Map<
    string,
    {
      window: BrowserWindow;
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const trusted = (w: BrowserWindow) => {
    const url = w.webContents.mainFrame.url.split("#")[0];
    return (
      url === expectedURL ||
      (expectedURL.startsWith("http:") && url === expectedURL + "/")
    );
  };
  const invoke = (method: string, params?: unknown): Promise<any> => {
    const windows = BrowserWindow.getAllWindows().filter(
      (w) => !w.isDestroyed() && trusted(w),
    );
    if (windows.length !== 1)
      return Promise.reject(
        Error("SESSION_UNAVAILABLE: Open one Nomi workspace window first."),
      );
    const window = windows[0],
      id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          Error(
            "SESSION_TIMEOUT: Inspect the change before retrying with the same requestId.",
          ),
        );
      }, 45000);
      pending.set(id, { window, resolve, reject, timer });
      window.webContents.send("nomi:automation-request", {
        id,
        method,
        params,
      });
    });
  };
  ipcMain.on("nomi:automation-result", (event, payload) => {
    const item = pending.get(payload?.id);
    if (
      !item ||
      event.sender !== item.window.webContents ||
      event.senderFrame !== event.sender.mainFrame ||
      !trusted(item.window)
    )
      return;
    pending.delete(payload.id);
    clearTimeout(item.timer);
    if (payload.ok) item.resolve(payload.value);
    else
      item.reject(
        Error(
          typeof payload.error === "string"
            ? payload.error
            : "Session request failed",
        ),
      );
  });
  let snapshotId: string | undefined;
  const service = new AutomationService({
    journalDirectory: join(folder, "history"),
    libraryPath: async () => (await store.status()).path,
    decodeImage: (bytes) =>
      !nativeImage.createFromBuffer(Buffer.from(bytes)).isEmpty(),
    session: {
      async snapshot(includeSelection = false, surroundingCharacters = 1500) {
        const result = await invoke("snapshot", {
          includeSelection,
          surroundingCharacters,
        });
        snapshotId = result.snapshotId;
        return result as AutomationSnapshot;
      },
      async commit(document, expectedRevision, assets: DocumentAssetBytes[]) {
        await invoke("commit", {
          document,
          expectedRevision,
          assets,
          snapshotId,
        });
      },
      async asset(id) {
        return (
          (await store.asset("local-device", "document.home", id))?.bytes ??
          Promise.reject(Error("Attachment missing"))
        );
      },
      async open(noteId, blockId) {
        const result = await invoke("open", { noteId, blockId });
        const w = BrowserWindow.getAllWindows().find(trusted);
        w?.show();
        w?.focus();
        return result;
      },
    },
  });
  let enabled = process.env.NOMI_MCP === "1",
    readOnly = process.env.NOMI_MCP_READ_ONLY === "1";
  try {
    const settings = JSON.parse((await regularFile(config, 1024)).toString());
    enabled = enabled || settings.enabled === true;
    readOnly = readOnly || settings.readOnly === true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const start = async () => {
    listener = await startAutomationServer(
      connectionFile,
      async (name, args) => {
        if (readOnly && !readOnlyTools.has(name))
          throw Error("READ_ONLY: Local MCP is read-only.");
        const result = await service.call(name, args);
        if (name === "get_context") return { ...(result as object), readOnly };
        return result;
      },
      readOnly,
    );
  };
  if (enabled) await start();
  let changing = false;
  ipcMain.handle("nomi:automation-settings", async (event, method, value) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      event.senderFrame !== event.sender.mainFrame ||
      !trusted(window)
    )
      throw Error("Access denied");
    const status = () => ({ enabled, readOnly });
    if (method === "status") return status();
    if (method === "copyConfig") {
      clipboard.writeText(
        JSON.stringify(
          {
            mcpServers: {
              nomi: {
                command: "node",
                args: [
                  join(__dirname, "mcp.mjs"),
                  "--connection",
                  connectionFile,
                ],
              },
            },
          },
          null,
          2,
        ),
      );
      return status();
    }
    if (
      (method !== "enabled" && method !== "readOnly") ||
      typeof value !== "boolean"
    )
      throw Error("Invalid MCP setting");
    if (changing) throw Error("MCP 设置正在更新，请稍后再试。");
    changing = true;
    const previous = status();
    try {
      if (listener) {
        await listener.close();
        listener = undefined;
      }
      if (method === "enabled") enabled = value;
      else readOnly = value;
      if (enabled) await start();
      await atomicFile(config, JSON.stringify(status()));
      return status();
    } catch (error) {
      // Restore the previous runtime state if starting or persisting fails.
      if (listener) {
        await listener.close();
        listener = undefined;
      }
      enabled = previous.enabled;
      readOnly = previous.readOnly;
      if (enabled) {
        try {
          await start();
        } catch {
          enabled = false;
        }
      }
      throw error;
    } finally {
      changing = false;
    }
  });
  app.once("will-quit", () => {
    void listener?.close();
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(Error("Nomi is quitting"));
    }
    pending.clear();
  });
}
