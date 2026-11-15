import {
  documentFromSync,
  stableJSON,
  syncKey,
  type SyncEntity,
  type SyncRecord,
} from "./protocol";

export interface SyncConflict {
  key: string;
  base: SyncRecord | null;
  local: SyncEntity | null;
  remote: SyncRecord | null;
}
function content(item: SyncEntity | SyncRecord | undefined) {
  return item && !("deleted" in item && item.deleted)
    ? stableJSON(item.data)
    : null;
}
/** Three-way, whole-entity reconciliation. Deleted identities remain in the remote baseline. */
export function reconcileSync(
  base: SyncRecord[],
  local: SyncEntity[],
  remote: SyncRecord[],
) {
  const b = new Map(base.map((r) => [syncKey(r), r]));
  const l = new Map(local.map((r) => [syncKey(r), r]));
  const r = new Map(remote.map((r) => [syncKey(r), r]));
  const entities: SyncEntity[] = [],
    conflicts: SyncConflict[] = [];
  for (const key of [
    ...new Set([...b.keys(), ...l.keys(), ...r.keys()]),
  ].sort()) {
    const before = b.get(key),
      ours = l.get(key),
      theirs = r.get(key);
    const bc = content(before),
      lc = content(ours),
      rc = content(theirs);
    const localChanged = lc !== bc,
      remoteChanged = rc !== bc;
    // Matching content with a newer tombstone still has to be acknowledged explicitly.
    if (localChanged && remoteChanged && lc !== rc) {
      conflicts.push({
        key,
        base: before ?? null,
        local: ours ?? null,
        remote: theirs ?? null,
      });
    }
    const chosen = localChanged ? ours : theirs;
    if (chosen && content(chosen) !== null)
      entities.push({ kind: chosen.kind, id: chosen.id, data: chosen.data! });
  }
  let structuralError: string | undefined;
  try {
    documentFromSync(entities, 1);
  } catch (error) {
    structuralError = error instanceof Error ? error.message : "文稿结构冲突。";
  }
  return { entities, conflicts, structuralError };
}
