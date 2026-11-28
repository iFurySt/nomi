import type { SyncRecord, SyncSpace } from "./protocol";
import type { SyncConflict } from "./reconcile";
export type SyncAction =
  | "status"
  | "configure"
  | "login"
  | "signIn"
  | "cancelSignIn"
  | "logout"
  | "spaces"
  | "bind"
  | "enabled"
  | "sync"
  | "conflict"
  | "resolve"
  | "sessions"
  | "revoke"
  | "historyItems"
  | "history"
  | "restore";
export interface CloudSyncStatus {
  enabled: boolean;
  signingIn?: boolean;
  confirmAccountMerge?: boolean;
  devices?: CloudSyncSession[];
  server?: string;
  account?: { email: string; server: string };
  binding?: { space: string; library: string };
  phase:
    "off" | "ready" | "syncing" | "pending" | "conflict" | "error" | "auth";
  error?: string;
  lastSyncedAt?: number;
  conflicts: number;
}
export interface CloudSyncConflictView {
  reviewId: string;
  conflicts: SyncConflict[];
  structuralError?: string;
  local: { kind: string; id: string; data: Record<string, unknown> }[];
  remote: { records: SyncRecord[] };
}
export interface CloudSyncSession {
  id: string;
  deviceId: string;
  deviceName: string;
  current?: boolean;
  createdAt: string;
  expiresAt: string;
}
export type CloudSyncReply =
  | CloudSyncStatus
  | SyncSpace[]
  | CloudSyncSession[]
  | CloudSyncConflictView
  | CloudHistoryItems
  | SyncRecord[]
  | undefined;

export interface CloudHistoryItems {
  notes: { id: string; title: string }[];
  blocks: { id: string; title: string; version: number; deleted: boolean }[];
}
