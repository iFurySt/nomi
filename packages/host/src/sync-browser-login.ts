import { randomBytes, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  type SyncFetch,
  SyncAPIError,
  SyncClient,
  syncAPIURL,
  syncWebsiteURL,
} from "./sync-client";

/** Verifier remains in this process. The app link contains no credentials. */
export class SyncBrowserLogin {
  private controller = new AbortController();
  private accepting = false;
  private page?: string;
  constructor(private request?: SyncFetch) {}
  cancel() {
    if (this.accepting) return false;
    this.controller.abort();
    return true;
  }
  async reopen(open: (url: string) => Promise<void>) {
    if (this.page && !this.controller.signal.aborted && !this.accepting)
      await open(this.page);
  }
  async run(
    site: string,
    deviceId: string,
    deviceName: string,
    development: boolean,
    open: (url: string) => Promise<void>,
  ) {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const signal = this.controller.signal;
    const client = new SyncClient(syncAPIURL(site), undefined, this.request);
    const start = async () => {
      const attempt = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      try {
        return await client.browserStart(
          challenge,
          deviceId,
          deviceName,
          development ? "nomi-dev" : "nomi",
          attempt,
        );
      } catch (error) {
        attempt.throwIfAborted();
        throw error;
      }
    };
    const request = await start().catch(async (error) => {
      signal.throwIfAborted();
      if (!isConnectionError(error)) throw error;
      await delay(500, undefined, { signal });
      return start();
    });
    if (!/^login\.[a-f0-9]{48}$/.test(request.id))
      throw Error("Invalid sign-in response.");
    const expires = Math.min(
      Date.parse(request.expiresAt),
      Date.now() + 300_000,
    );
    if (!Number.isFinite(expires)) throw Error("Invalid sign-in expiry.");
    signal.throwIfAborted();
    this.page = `${syncWebsiteURL(site)}/login?request=${encodeURIComponent(request.id)}`;
    await open(this.page);
    while (Date.now() < expires) {
      signal.throwIfAborted();
      const result = await client
        .browserExchange(request.id, verifier)
        .catch((error) => {
          if (!isConnectionError(error)) throw error;
          return { pending: true };
        });
      if (!("pending" in result)) {
        if (signal.aborted) {
          await new SyncClient(client.baseURL, result.token, this.request)
            .revoke(result.sessionId)
            .catch(() => {});
          signal.throwIfAborted();
        }
        this.accepting = true;
        return { server: client.baseURL, login: result };
      }
      await delay(1500, undefined, { signal });
    }
    throw Error("Sign-in expired. Try again.");
  }
}

function isConnectionError(error: unknown) {
  return error instanceof SyncAPIError
    ? [502, 503, 504].includes(error.status)
    : error instanceof Error &&
        (error instanceof TypeError ||
          error.name === "TimeoutError" ||
          error.message.startsWith("net::ERR_"));
}
