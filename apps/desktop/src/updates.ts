import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { UpdateStatus } from "../../../packages/core/src/updates";

type Bridge = {
  start(): void;
  check(): void;
  state(): Omit<UpdateStatus, "version" | "available"> & {
    pendingInstall: boolean;
  };
  automatic(enabled: boolean): void;
  download(): void;
  install(): void;
  cancel(): void;
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
  let paused = false;
  let saveError = "";
  const install = async () => {
    if (preparing || !bridge) return;
    if (bridge.state().phase !== "ready" && !bridge.state().pendingInstall)
      throw Error("更新尚未准备好。");
    preparing = true;
    saveError = "";
    try {
      const saved = await Promise.all(BrowserWindow.getAllWindows().map(flush));
      if (!saved.every(Boolean))
        throw Error("文稿尚未保存，更新已暂停。请保存后重试。");
      paused = false;
      if (bridge.state().pendingInstall) bridge.resume();
      else bridge.install();
    } catch (cause) {
      paused = true;
      saveError = cause instanceof Error ? cause.message : "保存失败，请重试。";
    } finally {
      preparing = false;
    }
  };
  // Sparkle's final relaunch gate catches edits made after the initial click.
  const timer = setInterval(() => {
    if (bridge?.state().pendingInstall && !preparing && !paused) void install();
  }, 250);
  timer.unref();
  const status = (): UpdateStatus => ({
    version: app.getVersion(),
    available: !!bridge,
    ...bridge?.state(),
    ...(preparing ? { phase: "installing" as const } : {}),
    ...(paused ? { phase: "ready" as const, error: saveError } : {}),
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
    // The sidebar remains visible if a session is already downloading/ready.
  };
  ipcMain.handle(
    "nomi:updates",
    async (event, method: unknown, value?: unknown) => {
      const frame = event.senderFrame;
      if (
        frame !== event.sender.mainFrame ||
        frame?.url.split("#")[0] !== expectedURL
      )
        throw Error("Update access denied.");
      if (method === "status") return status();
      if (method === "check") check();
      else if (method === "automatic" && typeof value === "boolean" && bridge)
        bridge.automatic(value);
      else if (method === "download" && bridge) bridge.download();
      else if (method === "install" && bridge) await install();
      else if (method === "cancel" && bridge) bridge.cancel();
      else throw Error("Unknown update operation.");
      return status();
    },
  );
  return { check, status };
}
