import {
  SYNC_PROTOCOL,
  type SyncChanges,
  type SyncCommit,
  type SyncLogin,
  type SyncReceipt,
  type SyncRecord,
  type SyncSnapshot,
  type SyncSpace,
} from "../../core/src/sync/protocol";
import { createHash } from "node:crypto";

export class SyncAPIError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly conflicts: SyncRecord[] = [],
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}
export function syncServerURL(input: string): string {
  const url = new URL(input);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(url.pathname)
  )
    throw Error("同步服务地址不能包含账号、查询参数或特殊路径字符。");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    throw Error("云同步需要 HTTPS，本机开发可使用 HTTP。");
  return url.origin + url.pathname.replace(/\/$/, "");
}
async function readBounded(response: Response, limit: number): Promise<Buffer> {
  const expected = Number(response.headers.get("content-length") ?? 0);
  if (expected > limit) {
    await response.body?.cancel();
    throw Error("同步响应超过大小限制。");
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error("同步响应超过大小限制。");
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export type SyncFetch = (
  url: string,
  options: RequestInit,
) => Promise<Response>;

export class SyncClient {
  readonly baseURL: string;
  constructor(
    url: string,
    private token?: string,
    private request: SyncFetch = fetch,
  ) {
    this.baseURL = syncServerURL(url);
  }
  private async send(
    path: string,
    method = "GET",
    body?: unknown,
    raw = false,
    signal = AbortSignal.timeout(60_000),
  ): Promise<Response> {
    const response = await this.request(`${this.baseURL}${path}`, {
      method,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body === undefined
          ? {}
          : {
              "Content-Type": raw
                ? "application/octet-stream"
                : "application/json",
            }),
      },
      body:
        body === undefined
          ? undefined
          : raw
            ? new Uint8Array(body as Uint8Array)
            : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = (await readBounded(response, 8 * 1024 * 1024)).toString();
      let error: { code?: string; message?: string; conflicts?: SyncRecord[] } =
        {};
      try {
        error = JSON.parse(text);
      } catch {
        /* Non-JSON proxy errors remain generic. */
      }
      const retry = response.headers.get("retry-after");
      const delay = retry
        ? Number.isFinite(Number(retry))
          ? Number(retry) * 1000
          : Date.parse(retry) - Date.now()
        : 0;
      throw new SyncAPIError(
        response.status,
        error.code ?? "http_error",
        error.message ?? `同步服务返回 ${response.status}。`,
        Array.isArray(error.conflicts) ? error.conflicts : [],
        Number.isFinite(delay) ? Math.max(0, delay) : 0,
      );
    }
    return response;
  }
  private async json<T>(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    return JSON.parse(
      (
        await readBounded(
          await this.send(path, method, body, false, signal),
          8 * 1024 * 1024,
        )
      ).toString(),
    ) as T;
  }
  login(email: string, password: string, deviceId: string, deviceName: string) {
    return this.json<SyncLogin>("/auth/login", "POST", {
      email,
      password,
      deviceId,
      deviceName,
    });
  }
  browserStart(
    challenge: string,
    deviceId: string,
    deviceName: string,
    scheme: "nomi" | "nomi-dev",
    signal?: AbortSignal,
  ) {
    return this.json<{ id: string; expiresAt: string }>(
      "/auth/desktop/start",
      "POST",
      { challenge, deviceId, deviceName, scheme },
      signal,
    );
  }
  browserExchange(id: string, verifier: string) {
    return this.json<SyncLogin | { pending: true }>(
      "/auth/desktop/exchange",
      "POST",
      { id, verifier },
    );
  }
  me() {
    return this.json<{
      user: { id: string; email: string };
      sessionId: string;
      deviceId: string;
    }>("/v1/me");
  }
  spaces() {
    return this.json<SyncSpace[]>("/v1/spaces");
  }
  createSpace(name: string) {
    return this.json<SyncSpace>("/v1/spaces", "POST", { name });
  }
  sessions() {
    return this.json<
      {
        id: string;
        deviceId: string;
        deviceName: string;
        createdAt: string;
        expiresAt: string;
      }[]
    >("/v1/sessions");
  }
  revoke(id: string) {
    return this.json(`/v1/sessions/${encodeURIComponent(id)}`, "DELETE");
  }
  private path(space: string, suffix: string) {
    return `/v1/spaces/${encodeURIComponent(space)}/${suffix}`;
  }
  async snapshot(space: string) {
    const s = await this.json<SyncSnapshot>(this.path(space, "snapshot"));
    if (
      s.protocol !== SYNC_PROTOCOL ||
      !Number.isSafeInteger(s.cursor) ||
      s.cursor < 0 ||
      !Array.isArray(s.records)
    )
      throw Error("不支持的云同步响应。");
    for (const r of s.records) validateSyncRecord(r);
    return s;
  }
  async changes(space: string, after: number) {
    const c = await this.json<SyncChanges>(
      this.path(space, `changes?after=${after}&limit=50`),
    );
    if (
      c.protocol !== SYNC_PROTOCOL ||
      !Number.isSafeInteger(c.cursor) ||
      c.cursor < after ||
      typeof c.hasMore !== "boolean" ||
      !Array.isArray(c.changes)
    )
      throw Error("云端增量响应无效。");
    let seq = after;
    for (const batch of c.changes) {
      if (
        !Number.isSafeInteger(batch.sequence) ||
        batch.sequence !== seq + 1 ||
        !Array.isArray(batch.records)
      )
        throw Error("云端增量不连续。");
      seq = batch.sequence;
      for (const r of batch.records) validateSyncRecord(r);
    }
    if (seq !== c.cursor || (c.hasMore && seq === after))
      throw Error("云端增量游标无效。");
    return c;
  }
  async commit(space: string, batch: SyncCommit) {
    const r = await this.json<SyncReceipt>(
      this.path(space, "commit"),
      "POST",
      batch,
    );
    if (
      !Number.isSafeInteger(r.sequence) ||
      r.sequence < 0 ||
      !Array.isArray(r.versions) ||
      r.versions.length !== batch.mutations.length
    )
      throw Error("云端提交确认无效。");
    for (const m of batch.mutations) {
      const v = r.versions.find((v) => v.kind === m.kind && v.id === m.id);
      if (
        !v ||
        !Number.isSafeInteger(v.version) ||
        v.version < m.baseVersion ||
        v.version > m.baseVersion + 1 ||
        v.version < 1
      )
        throw Error("云端版本确认无效。");
    }
    return r;
  }
  async history(
    space: string,
    kind: string,
    id: string,
    before = 0,
    limit = 50,
  ) {
    const records = await this.json<SyncRecord[]>(
      this.path(
        space,
        `history/${encodeURIComponent(kind)}/${encodeURIComponent(id)}?before=${before}&limit=${limit}`,
      ),
    );
    if (!Array.isArray(records) || records.length > limit)
      throw Error("历史记录响应无效。");
    let previous = before || Infinity;
    for (const record of records) {
      validateSyncRecord(record);
      if (
        record.kind !== kind ||
        record.id !== id ||
        record.version >= previous
      )
        throw Error("历史记录顺序无效。");
      previous = record.version;
    }
    return records;
  }
  async upload(space: string, sha256: string, bytes: Uint8Array) {
    if (
      bytes.length > 20 * 1024 * 1024 ||
      createHash("sha256").update(bytes).digest("hex") !== sha256
    )
      throw Error("附件摘要不一致。");
    const r = await this.send(
      this.path(space, `objects/${sha256}`),
      "PUT",
      bytes,
      true,
    );
    await readBounded(r, 1024);
  }
  async download(space: string, sha256: string, size: number): Promise<Buffer> {
    if (
      !/^[a-f0-9]{64}$/.test(sha256) ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > 20 * 1024 * 1024
    )
      throw Error("附件声明无效。");
    const bytes = await readBounded(
      await this.send(this.path(space, `objects/${sha256}`)),
      20 * 1024 * 1024,
    );
    if (
      bytes.length !== size ||
      createHash("sha256").update(bytes).digest("hex") !== sha256
    )
      throw Error("云端附件摘要不一致，未保存损坏原件。");
    return bytes;
  }
}
export function validateSyncRecord(r: SyncRecord) {
  if (
    !r ||
    !Number.isSafeInteger(r.version) ||
    r.version < 1 ||
    typeof r.deleted !== "boolean" ||
    typeof r.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(r.updatedAt)) ||
    !/^[a-zA-Z][\w.-]{0,95}$/.test(r.id) ||
    !["document", "note", "order", "block", "asset", "board"].includes(
      r.kind,
    ) ||
    (!r.deleted && (!r.data || r.data.id !== r.id))
  )
    throw Error("云端实体记录无效。");
}

/** Public site address; tolerate the previous API-suffixed preference. */
export function syncWebsiteURL(input: string): string {
  return syncServerURL(input || "https://nomi.ifuryst.com").replace(
    /\/api$/,
    "",
  );
}
export function syncAPIURL(input: string): string {
  return syncWebsiteURL(input) + "/api";
}
