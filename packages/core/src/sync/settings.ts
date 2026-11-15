import type { SyncRecord, SyncSpace } from "./protocol";
import type { SyncConflict } from "./reconcile";
export type SyncAction =
  | "status"
  | "login"
  | "logout"
  | "spaces"
  | "bind"
  | "enabled"
  | "sync"
  | "conflict"
  | "resolve"
  | "sessions"
  | "revoke";
export interface CloudSyncStatus {
  enabled: boolean;
  account?: { email: string; server: string };
  binding?: { space: string; library: string };
  phase:
    "off" | "ready" | "syncing" | "pending" | "conflict" | "error" | "auth";
  error?: string;
  lastSyncedAt?: number;
  conflicts: number;
}
export interface CloudSyncConflictView {
  conflicts: SyncConflict[];
  structuralError?: string;
  local: { kind: string; id: string; data: Record<string, unknown> }[];
  remote: { records: SyncRecord[] };
}
export interface CloudSyncSession {
  id: string;
  deviceId: string;
  deviceName: string;
  createdAt: string;
  expiresAt: string;
}
export type CloudSyncReply =
  | CloudSyncStatus
  | SyncSpace[]
  | CloudSyncSession[]
  | CloudSyncConflictView
  | undefined;
