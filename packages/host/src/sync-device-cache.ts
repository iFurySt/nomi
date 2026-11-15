import { rm } from "node:fs/promises";
import { atomicFile, regularFile } from "./document-files";
import type { CloudSyncSession } from "../../core/src/sync/settings";
import type { SyncSecretCodec } from "./cloud-sync";

/** Presentation-only cache. Authorization and revocation always go to the server. */
export class SyncDeviceCache {
  private scope?: string;
  private data?: CloudSyncSession[];
  private generation = 0;
  private pending?: Promise<CloudSyncSession[]>;
  private writes: Promise<void> = Promise.resolve();
  private constructor(
    private file: string,
    private codec: SyncSecretCodec,
  ) {}
  static async open(file: string, codec: SyncSecretCodec, scope?: string) {
    const cache = new SyncDeviceCache(file, codec);
    cache.scope = scope;
    try {
      const saved = JSON.parse(
        codec.decrypt(await regularFile(file, 1024 * 1024)),
      );
      if (
        scope &&
        saved.scope === scope &&
        Array.isArray(saved.devices) &&
        saved.devices.every(
          (d: CloudSyncSession) =>
            d &&
            [d.id, d.deviceId, d.deviceName, d.createdAt, d.expiresAt].every(
              (v) => typeof v === "string",
            ),
        )
      )
        cache.data = saved.devices;
    } catch {
      /* Missing or unreadable presentation cache never blocks local startup. */
    }
    if (!cache.data) await cache.persist();
    return cache;
  }
  get value() {
    return this.data;
  }
  async reset(scope?: string) {
    this.scope = scope;
    this.generation++;
    this.pending = undefined;
    this.data = undefined;
    await this.persist();
  }
  private persist() {
    const snapshot =
      this.data && this.scope
        ? { scope: this.scope, devices: this.data }
        : undefined;
    this.writes = this.writes
      .then(async () => {
        if (snapshot)
          await atomicFile(
            this.file,
            this.codec.encrypt(JSON.stringify(snapshot)),
          );
        else await rm(this.file, { force: true });
      })
      .catch(() => {}); // A cache disk failure must not fail sign-in or device revocation.
    return this.writes;
  }
  refresh(load: () => Promise<CloudSyncSession[]>) {
    if (this.pending) return this.pending;
    const generation = this.generation;
    const task = (async () => {
      const devices = await load();
      if (generation !== this.generation)
        throw Error("Device list changed; reopen the account panel.");
      this.data = devices;
      await this.persist();
      return devices;
    })();
    this.pending = task;
    void task
      .finally(() => {
        if (this.pending === task) this.pending = undefined;
      })
      .catch(() => {});
    return task;
  }
  async remove(id: string) {
    this.generation++;
    this.pending = undefined;
    this.data = this.data?.filter((d) => d.id !== id);
    await this.persist();
  }
}
