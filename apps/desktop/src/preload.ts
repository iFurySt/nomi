import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld(
  "nomiDesktop",
  Object.freeze({
    getRuntimeInfo: () => ipcRenderer.invoke("nomi:runtime-info"),
    requestData: (method: string, params?: unknown) =>
      ipcRenderer.invoke("nomi:data", method, params),
    requestChatGPT: (method: string, params?: unknown) =>
      ipcRenderer.invoke("nomi:chatgpt", method, params),
    requestArena: (method: string, params?: unknown) =>
      ipcRenderer.invoke("nomi:arena", method, params),
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
