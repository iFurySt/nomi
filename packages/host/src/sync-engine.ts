import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicFile, regularFile } from "./document-files";
import { SyncAPIError, type SyncClient } from "./sync-client";
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
  "snapshot" | "changes" | "commit" | "upload" | "download"
>;
export interface SyncConflictBundle {
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
  pending?: SyncCommit;
  conflict?: SyncConflictBundle;
}
/** One instance per binding. All cloud state is outside the portable .nomi package. */
export class SyncEngine {
  private running = false;
  private constructor(
    private folder: string,
    private state: State,
    private remote: SyncTransport,
    private local: SyncLocalIO,
  ) {}
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
      documentFromSync(state.base, 1);
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
  private async persist(state: State) {
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
    return (
      !!this.state.pending ||
      syncMutations(documentToSync(await this.local.read()), this.state.base)
        .length > 0
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
    const result = reconcileSync(this.state.base, local, remote.records);
    if (result.conflicts.length || result.structuralError) {
      await this.persist({
        ...this.state,
        conflict: {
          local,
          remote,
          conflicts: result.conflicts,
          structuralError: result.structuralError,
          createdAt: new Date().toISOString(),
        },
      });
      return false;
    }
    await this.apply(before, result.entities);
    await this.persist({
      ...this.state,
      base: remote.records,
      cursor: remote.cursor,
      conflict: undefined,
    });
    return true;
  }
  /** Scheduler controls upload deadlines. Poll-only runs never create an upload. */
  async run(upload = true) {
    if (this.running) return;
    if (!this.state.initialized) throw Error("请先选择上传本地库或下载云库。");
    this.running = true;
    try {
      if (this.state.conflict) return;
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
      const mutations = syncMutations(
        documentToSync(await this.local.read()),
        this.state.base,
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
      this.running = false;
    }
  }
  /** New cloud library only. Existing libraries require an explicit download/backup path. */
  async initialize(mode: "upload" | "download") {
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
  async resolve(
    choices: Record<string, "local" | "remote">,
    structural?: "local" | "remote",
  ) {
    if (this.running || !this.state.conflict)
      throw Error("当前没有可处理的冲突。");
    this.running = true;
    try {
      const conflict = this.state.conflict,
        before = await this.local.read();
      const remote = await this.remote.snapshot(this.state.binding.space);
      const local = documentToSync(before);
      // A review is tied to exactly what the user saw on both sides.
      if (
        stableJSON(local) !== stableJSON(conflict.local) ||
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
