import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { DocumentStore } from "../../../packages/host/src/document-store";
import {
  documentStorageMethods,
  type DocumentStorageMethod,
  type DocumentStorageSave,
} from "../../../packages/core/src/document-storage";

export function registerDocumentStorage(
  documents: DocumentStore,
  expected: string,
  flushWindowDocuments: (window: BrowserWindow) => Promise<boolean>,
) {
  let choosingDirectory = false;
  ipcMain.handle(
    "nomi:documents",
    async (event, method: DocumentStorageMethod, params?: unknown) => {
      const frame = event.senderFrame;
      const url = frame?.url.split("#")[0];
      if (
        frame !== event.sender.mainFrame ||
        (url !== expected &&
          !(expected.startsWith("http:") && url === expected + "/")) ||
        !documentStorageMethods.includes(method)
      )
        return { ok: false, error: "Document access denied." };
      try {
        let value: unknown;
        const request = params as
          | {
              profile: string;
              documentId: string;
              id: string;
              children?: boolean;
            }
          | undefined;
        if (method === "status") value = await documents.status();
        else if (method === "load")
          value = await documents.load(request?.profile!, request?.documentId!);
        else if (method === "save" || method === "backup") {
          if (!request) throw Error("Invalid save request.");
          if (method === "backup")
            await documents.backup(params as DocumentStorageSave);
          else await documents.save(params as DocumentStorageSave);
        } else if (method === "asset")
          value = await documents.asset(
            request?.profile!,
            request?.documentId!,
            request?.id!,
          );
        else if (method === "reveal-note") {
          const owner = BrowserWindow.fromWebContents(event.sender);
          if (!owner || !(await flushWindowDocuments(owner)))
            throw Error("请先保存文稿。");
          const path = await documents.notePath(
            request?.profile!,
            request?.documentId!,
            request?.id!,
            request?.children,
          );
          if (request?.children) {
            const error = await shell.openPath(path);
            if (error) throw Error(error);
          } else shell.showItemInFolder(path);
        } else if (method === "reveal") {
          const { path } = await documents.status();
          const error = await shell.openPath(path);
          if (error) throw Error("无法打开文稿目录。");
        } else if (method === "choose") {
          if (choosingDirectory) throw Error("请先完成已打开的目录选择。");
          choosingDirectory = true;
          try {
            const owner = BrowserWindow.fromWebContents(event.sender);
            if (!owner) throw Error("窗口已关闭。");
            if (!(await flushWindowDocuments(owner)))
              throw Error("文稿尚未保存成功，请先重试保存。");
            const { path } = await documents.status();
            const result = await dialog.showOpenDialog(owner, {
              title: "选择文稿保存目录",
              buttonLabel: "使用此目录",
              defaultPath: path,
              properties: ["openDirectory", "createDirectory"],
            });
            if (result.canceled || !result.filePaths[0]) value = null;
            else {
              if (!(await flushWindowDocuments(owner)))
                throw Error("文稿尚未保存成功，请先重试保存。");
              value = await documents.relocate(result.filePaths[0]);
            }
          } finally {
            choosingDirectory = false;
          }
        }
        return { ok: true, value };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "文稿目录操作失败。",
        };
      }
    },
  );
}
