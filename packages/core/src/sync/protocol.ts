import { parseCanvasDocument, type CanvasDocument } from "../canvas/document";

export const SYNC_PROTOCOL = "nomi-sync/v1" as const;
export const SYNC_POLICY = {
  quietMs: 3_000,
  maxWaitMs: 30_000,
  throttleMs: 5_000,
  sweepMs: 60_000,
  foregroundPullMs: 15_000,
  backgroundPullMs: 60_000,
  retryMs: [2_000, 5_000, 10_000, 30_000, 60_000],
} as const;
export type SyncKind =
  "document" | "note" | "order" | "block" | "asset" | "board";
export interface SyncEntity {
  kind: SyncKind;
  id: string;
  data: Record<string, unknown>;
}
export interface SyncRecord {
  kind: SyncKind;
  id: string;
  version: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
  updatedAt: string;
}
export interface SyncMutation {
  kind: SyncKind;
  id: string;
  baseVersion: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
}
export interface SyncCommit {
  protocol: typeof SYNC_PROTOCOL;
  requestId: string;
  mutations: SyncMutation[];
}
export interface SyncReceipt {
  sequence: number;
  versions: { kind: SyncKind; id: string; version: number }[];
}
export interface SyncSnapshot {
  protocol: typeof SYNC_PROTOCOL;
  cursor: number;
  records: SyncRecord[];
}
export interface SyncChanges {
  protocol: typeof SYNC_PROTOCOL;
  cursor: number;
  hasMore: boolean;
  changes: { sequence: number; records: SyncRecord[] }[];
}
export interface SyncSpace {
  id: string;
  name: string;
  sequence: number;
}
export interface SyncUser {
  id: string;
  email: string;
}
export interface SyncLogin {
  user: SyncUser;
  sessionId: string;
  deviceId: string;
  token: string;
  expiresAt: string;
}
export function syncKey(e: { kind: string; id: string }) {
  return `${e.kind}:${e.id}`;
}
export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJSON(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
/** File layout and local revision are not remote identities. Unknown JSON fields survive. */
export function documentToSync(input: CanvasDocument): SyncEntity[] {
  const doc = structuredClone(parseCanvasDocument(input));
  const { notes, blocks, assets, board, revision: _revision, ...header } = doc;
  const out: SyncEntity[] = [
    {
      kind: "document",
      id: doc.id,
      data: { ...header, noteOrder: notes.map((n) => n.id) },
    },
    { kind: "board", id: board.id, data: { ...board } },
  ];
  for (const note of notes) {
    const { blocks: order, ...data } = note;
    out.push(
      { kind: "note", id: note.id, data },
      { kind: "order", id: note.id, data: { id: note.id, blocks: order } },
    );
  }
  for (const b of blocks) out.push({ kind: "block", id: b.id, data: { ...b } });
  for (const a of assets) out.push({ kind: "asset", id: a.id, data: { ...a } });
  return out.sort((a, b) => syncKey(a).localeCompare(syncKey(b), "en"));
}
/** Applying untrusted remote payload always passes the native parser; future types fail closed. */
export function documentFromSync(
  records: (SyncEntity | SyncRecord)[],
  revision: number,
): CanvasDocument | undefined {
  const live = records.filter((r) => !("deleted" in r && r.deleted));
  if (!live.length) return;
  const seen = new Set<string>();
  for (const r of live) {
    if (
      seen.has(syncKey(r)) ||
      !r.data ||
      r.data.id !== r.id ||
      !["document", "note", "order", "block", "asset", "board"].includes(r.kind)
    )
      throw Error("云端文稿结构无效。");
    seen.add(syncKey(r));
  }
  const docs = live.filter((r) => r.kind === "document"),
    boards = live.filter((r) => r.kind === "board");
  if (docs.length !== 1 || boards.length !== 1)
    throw Error("云端文稿结构不完整。");
  const { noteOrder, ...header } = docs[0].data!;
  if (
    !Array.isArray(noteOrder) ||
    noteOrder.some((x) => typeof x !== "string") ||
    new Set(noteOrder).size !== noteOrder.length
  )
    throw Error("云端文稿顺序无效。");
  const byKey = new Map(live.map((r) => [syncKey(r), r]));
  if (
    live.filter((r) => r.kind === "note").length !== noteOrder.length ||
    live.filter((r) => r.kind === "order").length !== noteOrder.length
  )
    throw Error("云端文稿顺序不完整。");
  const notes = noteOrder.map((id) => {
    const note = byKey.get(`note:${id}`)?.data,
      order = byKey.get(`order:${id}`)?.data;
    if (!note || !order || !Array.isArray(order.blocks))
      throw Error("云端文稿内容不完整。");
    return { ...note, blocks: order.blocks };
  });
  const sorted = (kind: SyncKind) =>
    live
      .filter((r) => r.kind === kind)
      .sort((a, b) => a.id.localeCompare(b.id, "en"))
      .map((r) => r.data);
  return parseCanvasDocument({
    ...header,
    revision,
    notes,
    blocks: sorted("block"),
    assets: sorted("asset"),
    board: boards[0].data,
  });
}
export function syncMutations(
  local: SyncEntity[],
  base: SyncRecord[],
): SyncMutation[] {
  const current = new Map(local.map((r) => [syncKey(r), r]));
  const previous = new Map(base.map((r) => [syncKey(r), r]));
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const out: SyncMutation[] = [];
  for (const key of keys) {
    const l = current.get(key),
      b = previous.get(key);
    if (!l && (!b || b.deleted)) continue;
    if (l && b && !b.deleted && stableJSON(l.data) === stableJSON(b.data))
      continue;
    const entity = l ?? b!;
    out.push({
      kind: entity.kind,
      id: entity.id,
      baseVersion: b?.version ?? 0,
      deleted: !l,
      data: l?.data ?? null,
    });
  }
  return out.sort((a, b) => syncKey(a).localeCompare(syncKey(b), "en"));
}
