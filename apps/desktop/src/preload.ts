import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld(
  "nomiDesktop",
  Object.freeze({
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
