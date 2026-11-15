import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { atomicFile, regularFile } from "./document-files";
import { SyncClient, SyncAPIError, syncServerURL } from "./sync-client";
import { SyncEngine, type SyncBinding, type SyncLocalIO } from "./sync-engine";
import { SyncSchedule } from "../../core/src/sync/schedule";
import { SYNC_POLICY } from "../../core/src/sync/protocol";
import type { CloudSyncStatus } from "../../core/src/sync/settings";

export interface SyncSecretCodec {
  encrypt(text: string): Buffer;
  decrypt(bytes: Buffer): string;
}
interface Account {
  server: string;
  user: string;
  email: string;
  sessionId: string;
  token: string;
}
interface Config {
  deviceId: string;
  enabled: boolean;
  binding?: SyncBinding;
}
interface Options {
  folder: string;
  deviceName: string;
  codec: SyncSecretCodec;
  local: SyncLocalIO;
  library(): Promise<string>;
  backup(): Promise<void>;
  now?: () => number;
}
/** Host-owned settings and scheduler. Login credentials never enter portable documents. */
export class CloudSyncHost {
  private config!: Config;
  private account?: Account;
  private client?: SyncClient;
  private engine?: SyncEngine;
  private schedule = new SyncSchedule();
  private lastPull = -Infinity;
  private lastSweep = -Infinity;
  private lastSyncedAt?: number;
  private dirty = true;
  private foreground = true;
  private error?: string;
  private authExpired = false;
  private work?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private actionBusy = false;
  private now: () => number;
  private constructor(private options: Options) {
    this.now = options.now ?? Date.now;
  }
  static async open(options: Options) {
    const host = new CloudSyncHost(options);
    await mkdir(options.folder, { recursive: true, mode: 0o700 });
    try {
      host.config = JSON.parse(
        (
          await regularFile(join(options.folder, "settings.json"), 32 * 1024)
        ).toString(),
      );
      if (
        typeof host.config.enabled !== "boolean" ||
        !/^device\.[\w.-]+$/.test(host.config.deviceId)
      )
        throw Error("同步设置损坏。");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      host.config = { enabled: false, deviceId: `device.${randomUUID()}` };
      await host.save();
    }
    try {
      host.account = JSON.parse(
        options.codec.decrypt(
          await regularFile(join(options.folder, "account.enc"), 16 * 1024),
        ),
      );
      if (
        !host.account ||
        !host.account.user ||
        !host.account.token ||
        syncServerURL(host.account.server) !== host.account.server
      )
        throw Error("同步登录信息无效。");
      host.client = new SyncClient(host.account.server, host.account.token);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        host.error = "无法读取同步登录信息，请重新登录。";
        host.authExpired = true;
      }
    }
    return host;
  }
  private async save() {
    await atomicFile(
      join(this.options.folder, "settings.json"),
      JSON.stringify(this.config),
    );
  }
  start() {
    if (!this.timer)
      this.timer = setInterval(() => {
        void this.tick();
      }, 1000);
    void this.tick();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  activity() {
    this.schedule.activity(this.now());
  }
  saved() {
    this.dirty = true;
    if (!this.authExpired) this.schedule.paused = false;
    this.schedule.activity(this.now());
  }
  wake() {
    this.lastPull = -Infinity;
    this.dirty = true;
    void this.tick();
  }
  focus(foreground: boolean) {
    this.foreground = foreground;
    if (foreground) this.wake();
  }
  online(value: boolean) {
    this.schedule.online = value;
    if (value) this.wake();
  }
  get status(): CloudSyncStatus {
    const conflict = this.engine?.status.conflict;
    return {
      enabled: this.config.enabled,
      account: this.account
        ? { email: this.account.email, server: this.account.server }
        : undefined,
      binding: this.config.binding
        ? {
            space: this.config.binding.space,
            library: this.config.binding.library,
          }
        : undefined,
      phase: !this.config.enabled
        ? "off"
        : this.authExpired
          ? "auth"
          : this.error
            ? "error"
            : conflict
              ? "conflict"
              : this.work
                ? "syncing"
                : this.schedule.firstPending !== undefined
                  ? "pending"
                  : "ready",
      error: this.error,
      lastSyncedAt: this.lastSyncedAt,
      conflicts: conflict ? Math.max(1, conflict.conflicts.length) : 0,
    };
  }
  private requireClient() {
    if (!this.client || !this.account) throw Error("请先登录云同步。");
    return this.client;
  }
  private async attach() {
    const binding = this.config.binding;
    if (!binding) return;
    if (binding.library !== (await this.options.library()))
      throw Error("文稿目录已改变，请切回原目录或重新绑定云同步。");
    if (
      !this.account ||
      binding.user !== this.account.user ||
      binding.server !== this.account.server
    )
      throw Error("云同步账号与资料库不匹配。");
    if (!this.engine) {
      const key = createHash("sha256")
        .update(JSON.stringify(binding))
        .digest("hex");
      this.engine = await SyncEngine.open(
        join(this.options.folder, "bindings", key),
        binding,
        this.requireClient(),
        this.options.local,
      );
    }
  }
  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.actionBusy) throw Error("请等待当前同步操作完成。");
    this.actionBusy = true;
    try {
      await this.work;
      return await run();
    } finally {
      this.actionBusy = false;
    }
  }
  async login(server: string, email: string, password: string) {
    return this.exclusive(async () => {
      if (
        typeof server !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 254 ||
        password.length > 72
      )
        throw Error("登录信息无效。");
      const url = syncServerURL(server),
        login = await new SyncClient(url).login(
          email,
          password,
          this.config.deviceId,
          this.options.deviceName,
        );
      // Encrypt before making a newly logged-in account persistent or enabling network work.
      const account: Account = {
        server: url,
        user: login.user.id,
        email: login.user.email,
        sessionId: login.sessionId,
        token: login.token,
      };
      const encrypted = this.options.codec.encrypt(JSON.stringify(account));
      await atomicFile(join(this.options.folder, "account.enc"), encrypted);
      if (
        this.config.binding &&
        (this.config.binding.server !== url ||
          this.config.binding.user !== account.user)
      ) {
        this.config.binding = undefined;
        this.config.enabled = false;
      }
      this.account = account;
      this.client = new SyncClient(url, login.token);
      this.engine = undefined;
      this.authExpired = false;
      this.error = undefined;
      this.schedule.paused = false;
      this.schedule.succeeded();
      await this.save();
      await this.attach();
      return this.status;
    });
  }
  async logout() {
    return this.exclusive(async () => {
      this.config.enabled = false;
      await this.save();
      const client = this.client,
        session = this.account?.sessionId;
      await rm(join(this.options.folder, "account.enc"), { force: true });
      this.account = undefined;
      this.client = undefined;
      this.engine = undefined;
      this.error = undefined;
      this.authExpired = false;
      // Local logout always works offline; a live server additionally revokes this device token.
      if (client && session) {
        try {
          await client.revoke(session);
        } catch {}
      }
      return this.status;
    });
  }
  spaces() {
    return this.requireClient().spaces();
  }
  sessions() {
    return this.requireClient().sessions();
  }
  async revoke(id: string) {
    return this.exclusive(async () => {
      await this.requireClient().revoke(id);
      if (id === this.account?.sessionId) {
        this.authExpired = true;
        this.schedule.paused = true;
      }
      return this.status;
    });
  }
  async bind(mode: "upload" | "download", space?: string) {
    return this.exclusive(async () => {
      const client = this.requireClient();
      if (mode !== "upload" && mode !== "download")
        throw Error("同步方式无效。");
      if (mode === "download" && (!space || typeof space !== "string"))
        throw Error("请选择云端资料库。");
      // Always protect the local durable library before first download or a rebind.
      await this.options.backup();
      const library = await this.options.library();
      const target =
        mode === "upload"
          ? (await client.createSpace(this.options.deviceName)).id
          : space!;
      const binding: SyncBinding = {
        server: this.account!.server,
        user: this.account!.user,
        space: target,
        library,
      };
      const key = createHash("sha256")
        .update(JSON.stringify(binding))
        .digest("hex");
      const engine = await SyncEngine.open(
        join(this.options.folder, "bindings", key),
        binding,
        client,
        this.options.local,
      );
      await engine.initialize(mode);
      this.config = { ...this.config, binding, enabled: true };
      await this.save();
      this.engine = engine;
      this.schedule = new SyncSchedule();
      this.dirty = true;
      this.error = undefined;
      this.lastPull = -Infinity;
      return this.status;
    });
  }
  async enabled(value: boolean) {
    return this.exclusive(async () => {
      if (value) {
        this.requireClient();
        if (!this.config.binding) throw Error("请先选择资料库。");
        await this.attach();
      }
      this.config.enabled = value;
      await this.save();
      if (value) {
        if (!this.authExpired) this.schedule.paused = false;
        this.dirty = true;
        this.lastPull = -Infinity;
        this.error = undefined;
      }
      return this.status;
    });
  }
  async conflict() {
    await this.attach();
    return this.engine?.status.conflict;
  }
  async resolve(
    choices: Record<string, "local" | "remote">,
    structural?: "local" | "remote",
  ) {
    return this.exclusive(async () => {
      await this.attach();
      if (!this.engine) throw Error("尚未绑定资料库。");
      await this.engine.resolve(choices, structural);
      this.error = undefined;
      this.dirty = true;
      this.schedule.paused = false;
      return this.status;
    });
  }
  async tick(manual = false): Promise<void> {
    if (this.work) {
      await this.work;
      if (manual) return this.tick(true);
      return;
    }
    if (
      this.actionBusy ||
      !this.config.enabled ||
      !this.client ||
      !this.config.binding ||
      this.authExpired ||
      !this.schedule.online
    )
      return;
    const run = async () => {
      const now = this.now();
      if (this.schedule.paused || now < this.schedule.retryAt) return;
      try {
        await this.attach();
        if (!this.engine) return;
        if (
          this.dirty ||
          manual ||
          now - this.lastSweep >= SYNC_POLICY.sweepMs
        ) {
          this.dirty = false;
          this.lastSweep = now;
          if (await this.engine.hasChanges()) {
            if (this.schedule.firstPending === undefined)
              this.schedule.changed(now);
          } else this.schedule.clear();
        }
        if (this.engine.status.conflict) return;
        const upload = now >= this.schedule.deadline(manual);
        if (
          !manual &&
          !upload &&
          now - this.lastPull <
            (this.foreground
              ? SYNC_POLICY.foregroundPullMs
              : SYNC_POLICY.backgroundPullMs)
        )
          return;
        if (upload) this.schedule.started(now);
        await this.engine.run(upload);
        this.lastPull = this.now();
        this.schedule.succeeded();
        this.error = undefined;
        if (!(await this.engine.hasChanges())) {
          this.schedule.clear();
          this.lastSyncedAt = this.now();
        } else if (this.schedule.firstPending === undefined)
          this.schedule.changed(this.now());
      } catch (e) {
        this.error =
          e instanceof SyncAPIError
            ? e.status === 401
              ? "登录已过期，请重新登录。"
              : e.status === 429
                ? "请求较多，稍后自动重试。"
                : e.status >= 500
                  ? "同步服务暂时不可用，将自动重试。"
                  : e.message
            : e instanceof Error
              ? e.message
              : "同步暂时不可用。";
        this.schedule.failed(
          this.now(),
          e instanceof SyncAPIError ? e.retryAfterMs : 0,
        );
        if (
          e instanceof SyncAPIError &&
          (e.status === 401 ||
            (e.status >= 400 &&
              e.status < 500 &&
              e.status !== 429 &&
              e.status !== 409))
        ) {
          this.schedule.paused = true;
          this.authExpired = e.status === 401;
        }
      }
    };
    this.work = run();
    try {
      await this.work;
    } finally {
      this.work = undefined;
    }
  }
}
