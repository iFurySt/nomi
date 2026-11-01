import type { CanvasAsset, CanvasDocument } from "./canvas/index";

export const documentStorageMethods = [
  "status",
  "choose",
  "reveal",
  "reveal-note",
  "load",
  "save",
  "backup",
  "asset",
] as const;
export type DocumentStorageMethod = (typeof documentStorageMethods)[number];
export interface DocumentDirectoryStatus {
  path: string;
  defaultPath: string;
}
export interface DocumentAssetBytes {
  asset: CanvasAsset;
  bytes: Uint8Array;
}
export interface DocumentStorageSave {
  profile: string;
  documentId: string;
  document: CanvasDocument;
  assets: DocumentAssetBytes[];
  baseRevision: number | null;
}
