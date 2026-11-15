import { randomBytes, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { SyncClient, syncAPIURL, syncWebsiteURL } from "./sync-client";

/** Verifier remains in this process. The app link contains no credentials. */
export class SyncBrowserLogin {
  private controller = new AbortController();
  private accepting = false;
  cancel() {
    if (!this.accepting) this.controller.abort();
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
    const client = new SyncClient(syncAPIURL(site));
    const request = await client.browserStart(
      challenge,
      deviceId,
      deviceName,
      development ? "nomi-dev" : "nomi",
    );
    if (!/^login\.[a-f0-9]{48}$/.test(request.id))
      throw Error("Invalid sign-in response.");
    const expires = Math.min(
      Date.parse(request.expiresAt),
      Date.now() + 300_000,
    );
    if (!Number.isFinite(expires)) throw Error("Invalid sign-in expiry.");
    const signal = this.controller.signal;
    signal.throwIfAborted();
    await open(
      `${syncWebsiteURL(site)}/login?request=${encodeURIComponent(request.id)}`,
    );
    while (Date.now() < expires) {
      signal.throwIfAborted();
      const result = await client.browserExchange(request.id, verifier);
      if (!("pending" in result)) {
        if (signal.aborted) {
          await new SyncClient(client.baseURL, result.token)
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
