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
// Combine independent insertions while preserving the relative order on both devices.
// Deletions and competing moves need their shared ancestor or explicit review.
function joinOrder(ours: string[], theirs: string[], before: string[]) {
  const left = new Set(ours),
    right = new Set(theirs);
  if (before.some((id) => !left.has(id) || !right.has(id))) return;
  const anchors = ours.filter((id) => right.has(id));
  if (stableJSON(anchors) !== stableJSON(theirs.filter((id) => left.has(id))))
    return;
  const result: string[] = [];
  let i = 0,
    j = 0;
  for (const anchor of anchors) {
    while (theirs[j] !== anchor) result.push(theirs[j++]);
    while (ours[i] !== anchor) result.push(ours[i++]);
    result.push(anchor);
    i++;
    j++;
  }
  return result.concat(theirs.slice(j), ours.slice(i));
}

function joinBoardItems<T extends { id: string }>(ours: T[], theirs: T[]) {
  const items = new Map(theirs.map((item) => [item.id, item]));
  for (const item of ours) {
    if (
      items.has(item.id) &&
      stableJSON(items.get(item.id)) !== stableJSON(item)
    )
      return;
    items.set(item.id, item);
  }
  return [...items.values()];
}

function combine(ours: SyncEntity, theirs: SyncRecord, before?: SyncRecord) {
  const remote = theirs.data;
  if (!remote) return;
  if (ours.kind === "board" && !before) {
    const { placements, connectors, ...header } = ours.data;
    const { placements: rp, connectors: rc, ...rh } = remote;
    if (stableJSON(header) !== stableJSON(rh)) return;
    type Item = { id: string };
    const places = joinBoardItems(placements as Item[], rp as Item[]);
    const lines = joinBoardItems(
      (connectors ?? []) as Item[],
      (rc ?? []) as Item[],
    );
    if (places && lines)
      return {
        ...rh,
        placements: places,
        ...(connectors || rc ? { connectors: lines } : {}),
      };
    return;
  }
  const field =
    ours.kind === "document"
      ? "noteOrder"
      : ours.kind === "order"
        ? "blocks"
        : undefined;
  if (!field) return;
  const { [field]: left, ...lh } = ours.data,
    { [field]: right, ...rh } = remote;
  // On first connection the two desktop/mobile library containers can have different
  // default titles. Individual manuscript titles remain independently versioned.
  if (
    !before &&
    ours.kind === "document" &&
    ["我的画布", "文稿"].includes(String(lh.title))
  )
    lh.title = rh.title;
  if (stableJSON(lh) !== stableJSON(rh)) return;
  const order = joinOrder(
    left as string[],
    right as string[],
    (before?.data?.[field] ?? []) as string[],
  );
  if (order) return { ...rh, [field]: order };
}

/** Three-way, whole-entity reconciliation. Deleted identities remain in the remote baseline. */
export function reconcileSync(
  base: SyncRecord[],
  local: SyncEntity[],
  remote: SyncRecord[],
) {
  const b = new Map(base.map((r) => [syncKey(r), r]));
  // The board is a singleton. Older desktop and mobile stores use different IDs.
  const cloudBoard =
    !base.length &&
    remote.find((item) => item.kind === "board" && !item.deleted);
  const l = new Map(
    local.map((item) => {
      if (cloudBoard && item.kind === "board" && item.id !== cloudBoard.id)
        item = {
          ...item,
          id: cloudBoard.id,
          data: { ...item.data, id: cloudBoard.id },
        };
      return [syncKey(item), item];
    }),
  );
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
    if (
      localChanged &&
      (remoteChanged || (!before && theirs?.deleted)) &&
      lc !== rc
    ) {
      const merged = ours && theirs && combine(ours, theirs, before);
      if (ours && merged) {
        entities.push({ ...ours, data: merged });
        continue;
      }
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
