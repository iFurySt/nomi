import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld(
  "nomiDesktop",
  Object.freeze({
    onAutomationRequest: (
      callback: (request: {
        id: string;
        method: string;
        params: unknown;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: { id: string; method: string; params: unknown },
      ) => callback(request);
      ipcRenderer.on("nomi:automation-request", listener);
      return () =>
        ipcRenderer.removeListener("nomi:automation-request", listener);
    },
    replyAutomation: (result: unknown) =>
      ipcRenderer.send("nomi:automation-result", result),
    requestAutomationSettings: (method: string, value?: boolean) =>
      ipcRenderer.invoke("nomi:automation-settings", method, value),
    requestUpdates: (method: string, value?: boolean) =>
      ipcRenderer.invoke("nomi:updates", method, value),
    getRuntimeInfo: () => ipcRenderer.invoke("nomi:runtime-info"),
    requestDocuments: (method: string, params?: unknown) =>
      ipcRenderer.invoke("nomi:documents", method, params),
    requestChatGPT: (method: string, params?: unknown) =>
      ipcRenderer.invoke("nomi:chatgpt", method, params),
    onChatGPTDelta: (
      callback: (event: { requestId: string; text: string }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        value: { requestId: string; text: string },
      ) => callback(value);
      ipcRenderer.on("nomi:chatgpt-delta", listener);
      return () => ipcRenderer.removeListener("nomi:chatgpt-delta", listener);
    },
  }),
);
