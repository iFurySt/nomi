import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { createRequire } from "node:module";

type Bridge = {
  start(): void;
  check(): void;
  state(): { canCheck: boolean; pendingInstall: boolean; automatic: boolean };
  automatic(enabled: boolean): void;
  resume(): void;
};
export function setupUpdates(
  expectedURL: string,
  flush: (window: BrowserWindow) => Promise<boolean>,
  enabled: boolean,
) {
  let bridge: Bridge | undefined;
  let error = "";
  if (enabled && process.platform === "darwin") {
    try {
      bridge = createRequire(__filename)(
        join(process.resourcesPath, "sparkle.node"),
      ) as Bridge;
      bridge.start();
    } catch (cause) {
      bridge = undefined;
      error = cause instanceof Error ? cause.message : "更新服务不可用";
      console.error("Nomi updater could not initialize:", error);
    }
  }
  let preparing = false;
  // Poll a native flag instead of calling JavaScript from an AppKit callback.
  const timer = setInterval(() => {
    if (!bridge?.state().pendingInstall || preparing) return;
    preparing = true;
    void (async () => {
      while (true) {
        const saved = await Promise.all(
          BrowserWindow.getAllWindows().map(flush),
        );
        if (saved.every(Boolean)) {
          bridge!.resume();
          break;
        }
        const response = await dialog.showMessageBox({
          type: "warning",
          message: "文稿尚未保存，更新已暂停",
          detail: "请先解决保存问题。保存成功后才会安装更新。",
          buttons: ["重试保存", "稍后"],
          cancelId: 1,
        });
        if (response.response !== 0) return; // Keep the install gate closed; retry at the next explicit quit.
      }
      preparing = false;
    })().catch(() => {
      preparing = false;
    });
  }, 1000);
  timer.unref();
  const status = () => ({
    version: app.getVersion(),
    available: !!bridge,
    ...bridge?.state(),
    reason: bridge
      ? undefined
      : error ||
        (!enabled ? "开发版本不执行自动更新" : "此平台暂不支持自动更新"),
  });
  const check = () => {
    if (!bridge) {
      void dialog.showMessageBox({
        type: "info",
        message: "无法检查更新",
        detail: status().reason,
      });
      return;
    }
    if (bridge.state().canCheck) bridge.check();
  };
  ipcMain.handle("nomi:updates", (event, method: unknown, value?: unknown) => {
    const frame = event.senderFrame;
    if (
      frame !== event.sender.mainFrame ||
      frame?.url.split("#")[0] !== expectedURL
    )
      throw Error("Update access denied.");
    if (method === "status") return status();
    if (method === "check") {
      check();
      return status();
    }
    if (method === "automatic" && typeof value === "boolean" && bridge) {
      bridge.automatic(value);
      return status();
    }
    throw Error("Unknown update operation.");
  });
  return { check, status };
}
