import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { atomicFile, regularFile } from "./document-files";
import { pruneSyncRecovery } from "./sync-recovery";
import {
  SyncAPIError,
  validateSyncRecord,
  type SyncClient,
} from "./sync-client";
import {
  SYNC_PROTOCOL,
  documentFromSync,
  documentToSync,
  stableJSON,
  syncKey,
  syncMutations,
  type SyncCommit,
  type SyncEntity,
  type SyncRecord,
  type SyncSnapshot,
  type SyncMutation,
} from "../../core/src/sync/protocol";
import {
  reconcileSync,
  type SyncConflict,
} from "../../core/src/sync/reconcile";
import type {
  CanvasDocument,
  CanvasAsset,
} from "../../core/src/canvas/document";
import type { DocumentAssetBytes } from "../../core/src/document-storage";

export interface SyncBinding {
  server: string;
  user: string;
  space: string;
  library: string;
}
export interface SyncLocalIO {
  /** Returns durable local content; pending renderer drafts are never upload payloads. */
  read(): Promise<CanvasDocument>;
  /** Atomically checks the live editor AND durable revision, or throws without overwriting. */
  apply(
    before: CanvasDocument,
    after: CanvasDocument,
    assets: DocumentAssetBytes[],
  ): Promise<void>;
  asset(id: string): Promise<Uint8Array | undefined>;
}
export type SyncTransport = Pick<
  SyncClient,
  "snapshot" | "changes" | "commit" | "upload" | "download" | "history"
>;
export interface SyncConflictBundle {
  reviewId: string;
  local: SyncEntity[];
  remote: SyncSnapshot;
  conflicts: SyncConflict[];
  structuralError?: string;
  createdAt: string;
}
interface State {
  schema: "nomi-sync-state/v1";
  binding: SyncBinding;
  initialized: boolean;
  base: SyncRecord[];
  cursor: number;
  observed?: SyncEntity[];
  groups?: string[][];
  pending?: SyncCommit;
  conflict?: SyncConflictBundle;
}
/** One instance per binding. All cloud state is outside the portable .nomi package. */
export class SyncEngine {
  private running = false;
  private observationWrite?: Promise<void>;
  private observed: SyncEntity[];
  private groups: string[][];
  private constructor(
    private folder: string,
    private state: State,
    private remote: SyncTransport,
    private local: SyncLocalIO,
  ) {
    this.observed =
      state.observed ??
      state.base
        .filter((r) => !r.deleted)
        .map((r) => ({ kind: r.kind, id: r.id, data: r.data! }));
    this.groups = state.groups ?? [];
  }
  /** A single durable save is an atomic unit; overlapping saves coalesce conservatively. */
  observe(document: CanvasDocument) {
    const next = documentToSync(document),
      before = new Map(
        this.observed.map((e) => [syncKey(e), stableJSON(e.data)]),
      );
    const after = new Map(next.map((e) => [syncKey(e), stableJSON(e.data)]));
    const changed = new Set(
      [...new Set([...before.keys(), ...after.keys()])].filter(
        (key) => before.get(key) !== after.get(key),
      ),
    );
    if (changed.size) {
      const independent: string[][] = [];
      for (const group of this.groups) {
        if (group.some((key) => changed.has(key)))
          group.forEach((key) => changed.add(key));
        else independent.push(group);
      }
      this.groups = [...independent, [...changed].sort()];
      this.observed = next;
    }
  }
  async flushObservations() {
    if (this.running) return this.observationWrite;
    this.running = true;
    this.observationWrite = (async () => {
      try {
        await this.persist(this.state);
      } finally {
        this.running = false;
      }
    })();
    try {
      await this.observationWrite;
    } finally {
      this.observationWrite = undefined;
    }
  }
  private blocked() {
    if (this.state.conflict?.structuralError)
      return new Set(this.groups.flat());
    const keys = new Set(
      this.state.conflict?.conflicts.map((c) => c.key) ?? [],
    );
    for (const group of this.groups)
      if (group.some((key) => keys.has(key)))
        group.forEach((key) => keys.add(key));
    return keys;
  }
  private pruneGroups(local: SyncEntity[]) {
    const changed = new Set(syncMutations(local, this.state.base).map(syncKey));
    this.groups = this.groups
      .map((g) => g.filter((k) => changed.has(k)))
      .filter((g) => g.length > 0);
  }
  static async open(
    folder: string,
    binding: SyncBinding,
    remote: SyncTransport,
    local: SyncLocalIO,
  ) {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    let state: State;
    try {
      state = JSON.parse(
        (
          await regularFile(join(folder, "state.json"), 40 * 1024 * 1024)
        ).toString(),
      );
      if (
        state.schema !== "nomi-sync-state/v1" ||
        stableJSON(state.binding) !== stableJSON(binding) ||
        !Array.isArray(state.base) ||
        !Number.isSafeInteger(state.cursor) ||
        state.cursor < 0
      )
        throw Error("同步状态与资料库不匹配，请保留该目录并重新绑定。");
      state.base.forEach(validateSyncRecord);
      if (!state.conflict) documentFromSync(state.base, 1);
      else documentFromSync(state.conflict.remote.records, 1);
      if (
        state.pending &&
        (state.pending.protocol !== SYNC_PROTOCOL ||
          !Array.isArray(state.pending.mutations) ||
          !state.pending.requestId)
      )
        throw Error("同步队列损坏，请保留状态文件以恢复。");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = {
        schema: "nomi-sync-state/v1",
        binding,
        initialized: false,
        base: [],
        cursor: 0,
      };
    }
    const engine = new SyncEngine(folder, state, remote, local);
    await engine.persist(state);
    // Cleanup failure must never prevent editing or recovery.
    await pruneSyncRecovery(folder).catch(() => {});
    return engine;
  }
  get status() {
    return {
      inFlight: this.running,
      pending: !!this.state.pending,
      cursor: this.state.cursor,
      conflict: this.state.conflict
        ? structuredClone(this.state.conflict)
        : undefined,
    };
  }
  private conflictBundle(
    local: SyncEntity[],
    remote: SyncSnapshot,
    conflicts: SyncConflict[],
    structuralError?: string,
  ): SyncConflictBundle {
    const reviewId = createHash("sha256")
      .update(
        entityJSON(local) +
          recordVersions(remote.records) +
          (structuralError ?? ""),
      )
      .digest("hex");
    return {
      local,
      remote,
      conflicts,
      structuralError,
      reviewId,
      createdAt:
        this.state.conflict?.reviewId === reviewId
          ? this.state.conflict.createdAt
          : new Date().toISOString(),
    };
  }
  private async persist(state: State) {
    state = {
      ...state,
      observed: structuredClone(this.observed),
      groups: structuredClone(this.groups),
    };
    if (stableJSON(state) === stableJSON(this.state)) return;
    await atomicFile(join(this.folder, "state.json"), JSON.stringify(state));
    // A request may only be sent after the outbox rename itself is durable.
    const dir = await open(this.folder, "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
    this.state = state;
  }
  async hasChanges() {
    const document = await this.local.read();
    this.observe(document);
    this.pruneGroups(documentToSync(document));
    await this.flushObservations();
    const blocked = this.blocked();
    return (
      !!this.state.pending ||
      syncMutations(documentToSync(document), this.state.base).some(
        (m) => !blocked.has(syncKey(m)),
      )
    );
  }
  private async originals(document: CanvasDocument) {
    const assets: DocumentAssetBytes[] = [];
    for (const asset of document.assets) {
      if (!(await this.local.asset(asset.id)))
        assets.push({
          asset,
          bytes: new Uint8Array(
            await this.remote.download(
              this.state.binding.space,
              asset.sha256,
              asset.bytes,
            ),
          ),
        });
    }
    return assets;
  }
  private async apply(before: CanvasDocument, entities: SyncEntity[]) {
    if (entityJSON(documentToSync(before)) === entityJSON(entities)) return;
    const after = documentFromSync(entities, before.revision + 1);
    if (!after) throw Error("云端资料库为空，未覆盖本地文稿。");
    const assets = await this.originals(after);
    await this.local.apply(before, after, assets);
  }
  private async acknowledge() {
    const request = this.state.pending;
    if (!request) return;
    for (const mutation of request.mutations) {
      if (mutation.kind !== "asset" || mutation.deleted) continue;
      const asset = mutation.data as unknown as CanvasAsset;
      const bytes = await this.local.asset(asset.id);
      if (!bytes) throw Error("待同步的附件原件缺失；文稿已保留在本机。");
      await this.remote.upload(this.state.binding.space, asset.sha256, bytes);
    }
    // No state changes until the immutable request has an acknowledged receipt.
    const receipt = await this.remote.commit(this.state.binding.space, request);
    const versions = new Map(
      receipt.versions.map((v) => [syncKey(v), v.version]),
    );
    const base = new Map(this.state.base.map((r) => [syncKey(r), r]));
    for (const m of request.mutations) {
      const version = versions.get(syncKey(m));
      if (version === undefined)
        throw Error("同步确认缺少版本；将重试原请求。");
      base.set(syncKey(m), {
        kind: m.kind,
        id: m.id,
        version,
        deleted: m.deleted,
        data: m.data,
        updatedAt: new Date().toISOString(),
      });
    }
    // Do not advance the pull cursor: intervening commits from other devices must still be read.
    await this.persist({
      ...this.state,
      base: [...base.values()],
      pending: undefined,
    });
  }
  private async pullSnapshot(): Promise<SyncSnapshot> {
    const base = new Map(this.state.base.map((r) => [syncKey(r), r]));
    let cursor = this.state.cursor;
    try {
      for (;;) {
        const page = await this.remote.changes(
          this.state.binding.space,
          cursor,
        );
        for (const change of page.changes)
          for (const record of change.records) {
            const old = base.get(syncKey(record));
            if (!old || old.version <= record.version)
              base.set(syncKey(record), record);
          }
        cursor = page.cursor;
        if (!page.hasMore) break;
      }
      const records = [...base.values()];
      documentFromSync(records, 1);
      return { protocol: SYNC_PROTOCOL, cursor, records };
    } catch (error) {
      if (!(error instanceof SyncAPIError && error.code === "reset_required"))
        throw error;
      const snapshot = await this.remote.snapshot(this.state.binding.space);
      documentFromSync(snapshot.records, 1);
      return snapshot;
    }
  }
  private async reconcile(remote: SyncSnapshot) {
    const before = await this.local.read(),
      local = documentToSync(before);
    this.observe(before);
    const result = reconcileSync(this.state.base, local, remote.records);
    if (result.structuralError) {
      await this.persist({
        ...this.state,
        conflict: this.conflictBundle(
          local,
          remote,
          result.conflicts,
          result.structuralError,
        ),
      });
      return false;
    }
    await this.apply(before, result.entities);
    // Local input arriving after apply still belongs to the next durable save group.
    this.observe(await this.local.read());
    if (result.conflicts.length) {
      const conflict = this.conflictBundle(
        documentToSync(documentFromSync(result.entities, before.revision)!),
        remote,
        result.conflicts,
      );
      const keys = new Set(result.conflicts.map((c) => c.key));
      for (const group of this.groups)
        if (group.some((key) => keys.has(key)))
          group.forEach((key) => keys.add(key));
      const base = new Map(
        remote.records
          .filter((r) => !keys.has(syncKey(r)))
          .map((r) => [syncKey(r), r]),
      );
      for (const record of this.state.base)
        if (keys.has(syncKey(record))) base.set(syncKey(record), record);
      // Retain the old cursor while conflicted ancestors remain; replays are idempotent.
      await this.persist({ ...this.state, base: [...base.values()], conflict });
    } else
      await this.persist({
        ...this.state,
        base: remote.records,
        cursor: remote.cursor,
        conflict: undefined,
      });
    this.pruneGroups(documentToSync(await this.local.read()));
    return true;
  }
  private eligible(mutations: SyncMutation[]) {
    const blocked = this.blocked(),
      eligible = mutations.filter((m) => !blocked.has(syncKey(m)));
    if (this.state.conflict) {
      const cloud = new Map(
        this.state.conflict.remote.records.map((r) => [syncKey(r), r]),
      );
      for (const m of eligible)
        cloud.set(syncKey(m), {
          kind: m.kind,
          id: m.id,
          data: m.data,
          deleted: m.deleted,
          version: m.baseVersion + 1,
          updatedAt: new Date().toISOString(),
        });
      try {
        documentFromSync([...cloud.values()], 1);
      } catch {
        return [];
      }
    }
    return eligible;
  }
  /** Scheduler controls upload deadlines. Poll-only runs never create an upload. */
  async run(upload = true) {
    await this.observationWrite;
    if (this.running) return;
    if (!this.state.initialized) throw Error("请先选择上传本地库或下载云库。");
    this.running = true;
    try {
      this.observe(await this.local.read());
      if (this.state.pending) {
        if (!upload) return;
        try {
          await this.acknowledge();
        } catch (error) {
          if (!(error instanceof SyncAPIError && error.code === "conflict"))
            throw error;
          // A definite 409 means no write happened; next commit gets a new identity.
          await this.persist({ ...this.state, pending: undefined });
        }
      }
      if (!(await this.reconcile(await this.pullSnapshot()))) return;
      if (!upload) return;
      const mutations = this.eligible(
        syncMutations(documentToSync(await this.local.read()), this.state.base),
      );
      if (!mutations.length) return;
      await this.persist({
        ...this.state,
        pending: {
          protocol: SYNC_PROTOCOL,
          requestId: `req.${randomUUID()}`,
          mutations,
        },
      });
      try {
        await this.acknowledge();
      } catch (error) {
        if (!(error instanceof SyncAPIError && error.code === "conflict"))
          throw error;
        await this.persist({ ...this.state, pending: undefined });
      }
      await this.reconcile(await this.pullSnapshot());
    } finally {
      try {
        await this.persist(this.state);
      } finally {
        this.running = false;
      }
    }
  }
  /** New cloud library only. Existing libraries require an explicit download/backup path. */
  async initialize(mode: "upload" | "download") {
    await this.observationWrite;
    if (this.running || this.state.pending || this.state.base.length)
      throw Error("资料库已绑定或同步中。");
    this.running = true;
    try {
      const snapshot = await this.remote.snapshot(this.state.binding.space);
      if (mode === "upload") {
        if (snapshot.records.length)
          throw Error("云库已有内容，请选择下载，不能直接覆盖。");
        await this.persist({
          ...this.state,
          cursor: snapshot.cursor,
          initialized: true,
        });
      } else {
        const document = documentFromSync(snapshot.records, 1);
        if (!document) throw Error("云库尚无文稿。");
        const before = await this.local.read();
        await this.apply(before, documentToSync(document));
        await this.persist({
          ...this.state,
          base: snapshot.records,
          cursor: snapshot.cursor,
          initialized: true,
        });
      }
    } finally {
      this.running = false;
    }
  }
  async restoreBlock(
    record: SyncRecord,
    expectedVersion: number,
    noteId?: string,
  ) {
    await this.observationWrite;
    if (this.running || this.state.pending || this.state.conflict)
      throw Error("请先完成当前同步或处理冲突。");
    if (record.kind !== "block" || record.deleted || !record.data)
      throw Error("此版本没有可恢复的内容。");
    this.running = true;
    try {
      const remote = await this.remote.snapshot(this.state.binding.space);
      const current = remote.records.find(
        (r) => syncKey(r) === syncKey(record),
      );
      if ((current?.version ?? 0) !== expectedVersion)
        throw Error("云端内容已变化，请重新查看历史后恢复。");
      if (!(await this.reconcile(remote)) || this.state.conflict)
        throw Error("请先处理当前修改冲突。");
      const before = await this.local.read(),
        entities = documentToSync(before);
      if (
        syncMutations(entities, this.state.base).some(
          (m) => syncKey(m) === syncKey(record),
        )
      )
        throw Error("此块有尚未同步的修改，请先同步或保留副本。");
      const map = new Map(entities.map((e) => [syncKey(e), e]));
      map.set(syncKey(record), {
        kind: record.kind,
        id: record.id,
        data: record.data,
      });
      const assetIds = new Set<string>();
      const visit = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        for (const [key, item] of Object.entries(value)) {
          if (key === "asset" && typeof item === "string") assetIds.add(item);
          else visit(item);
        }
      };
      visit(record.data);
      for (const id of assetIds)
        if (!map.has(`asset:${id}`)) {
          const history = await this.remote.history(
            this.state.binding.space,
            "asset",
            id,
            0,
            50,
          );
          const asset = history.find((r) => !r.deleted && r.data);
          if (!asset) throw Error("此版本所需附件信息缺失，当前内容未改变。");
          map.set(`asset:${id}`, { kind: "asset", id, data: asset.data! });
        }
      if (
        !before.notes.some((n) => n.blocks.includes(record.id)) &&
        !before.board.placements.some((p) => p.content === record.id)
      ) {
        const order = noteId && map.get(`order:${noteId}`);
        if (!order) throw Error("请选择恢复内容所在的文稿。");
        map.set(syncKey(order), {
          ...order,
          data: {
            ...order.data,
            blocks: [...(order.data.blocks as string[]), record.id],
          },
        });
      }
      await this.apply(before, [...map.values()]);
    } finally {
      this.running = false;
    }
  }
  async resolve(
    choices: Record<string, "local" | "remote">,
    structural?: "local" | "remote",
    reviewId?: string,
  ) {
    await this.observationWrite;
    if (this.running || !this.state.conflict)
      throw Error("当前没有可处理的冲突。");
    if (!reviewId || reviewId !== this.state.conflict.reviewId)
      throw Error("冲突内容已变化，请重新查看双方内容。");
    this.running = true;
    try {
      const conflict = this.state.conflict,
        before = await this.local.read();
      const remote = await this.remote.snapshot(this.state.binding.space);
      const local = documentToSync(before);
      // A review is tied to exactly what the user saw on both sides.
      if (
        entityJSON(local) !== entityJSON(conflict.local) ||
        recordVersions(remote.records) !==
          recordVersions(conflict.remote.records)
      ) {
        await this.reconcile(remote);
        throw Error("冲突内容已变化，请查看更新后的双方内容再选择。");
      }
      const result = reconcileSync(this.state.base, local, remote.records);
      let entities = result.entities;
      if (result.structuralError) {
        if (!structural) throw Error("结构冲突需要选择要保留的资料库版本。");
        entities =
          structural === "local"
            ? local
            : remote.records
                .filter((r) => !r.deleted)
                .map((r) => ({ kind: r.kind, id: r.id, data: r.data! }));
      } else {
        const map = new Map(entities.map((e) => [syncKey(e), e]));
        for (const item of result.conflicts) {
          if (!choices[item.key]) throw Error("请为每个冲突选择一个版本。");
          const chosen =
            choices[item.key] === "local" ? item.local : item.remote;
          if (!chosen || ("deleted" in chosen && chosen.deleted))
            map.delete(item.key);
          else
            map.set(item.key, {
              kind: chosen.kind,
              id: chosen.id,
              data: chosen.data!,
            });
        }
        entities = [...map.values()];
      }
      documentFromSync(entities, 1);
      // Keep the reviewed versions outside .nomi before any replacement; recovery remains possible.
      await atomicFile(
        join(this.folder, `resolved-${randomUUID()}.json`),
        JSON.stringify(conflict),
      );
      await this.apply(before, entities);
      await this.persist({
        ...this.state,
        base: remote.records,
        cursor: remote.cursor,
        conflict: undefined,
      });
      await pruneSyncRecovery(this.folder).catch(() => {});
    } finally {
      this.running = false;
    }
  }
}

function entityJSON(items: (SyncEntity | SyncRecord)[]) {
  return stableJSON(
    [...items].sort((a, b) => syncKey(a).localeCompare(syncKey(b), "en")),
  );
}

function recordVersions(records: SyncRecord[]) {
  return entityJSON(
    records.map(({ updatedAt: _updatedAt, ...record }) => record as SyncRecord),
  );
}
