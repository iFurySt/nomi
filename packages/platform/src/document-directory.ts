import type {
  DocumentStorageMethod,
  DocumentDirectoryStatus,
} from "@nomi/core";
export const documentDirectoryAvailable = () =>
  typeof window !== "undefined" && !!window.nomiDesktop?.requestDocuments;
export async function documentRequest<T>(
  method: DocumentStorageMethod,
  params?: unknown,
): Promise<T> {
  const bridge = window.nomiDesktop?.requestDocuments;
  if (!bridge) throw Error("文稿目录仅在桌面 App 中可用。");
  const result = await bridge(method, params);
  if (!result.ok) throw Error(result.error);
  return result.value as T;
}
export const readDocumentDirectory = () =>
  documentRequest<DocumentDirectoryStatus>("status");
export const chooseDocumentDirectory = () =>
  documentRequest<DocumentDirectoryStatus | null>("choose");
export const revealDocumentDirectory = () => documentRequest<void>("reveal");
