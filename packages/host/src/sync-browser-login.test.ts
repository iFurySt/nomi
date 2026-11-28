import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { SyncBrowserLogin } from "./sync-browser-login";
import { SyncClient, syncWebsiteURL, syncAPIURL } from "./sync-client";

afterEach(() => vi.restoreAllMocks());
const request = {
  id: "login." + "a".repeat(48),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
const login = {
  token: "secret",
  sessionId: "session.fixture",
  deviceId: "device.fixture",
  expiresAt: request.expiresAt,
  user: { id: "user.fixture", email: "fixture@example.invalid" },
};

it("defaults the website and maps legacy API URLs without duplicating the prefix", () => {
  expect(syncWebsiteURL("")).toBe("https://nomi.ifuryst.com");
  expect(syncAPIURL("")).toBe("https://nomi.ifuryst.com/api");
  expect(syncWebsiteURL("https://example.test/api/")).toBe(
    "https://example.test",
  );
  expect(syncAPIURL("https://example.test/api/")).toBe(
    "https://example.test/api",
  );
});

it("keeps the verifier in the host and opens only the website request", async () => {
  const start = vi
    .spyOn(SyncClient.prototype, "browserStart")
    .mockResolvedValue(request);
  const exchange = vi
    .spyOn(SyncClient.prototype, "browserExchange")
    .mockResolvedValue(login);
  const open = vi.fn(async () => {});
  const result = await new SyncBrowserLogin().run(
    "",
    "device.fixture",
    "Test Mac",
    true,
    open,
  );
  expect(open).toHaveBeenCalledWith(
    "https://nomi.ifuryst.com/login?request=" + request.id,
  );
  const verifier = exchange.mock.calls[0][1];
  expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
    start.mock.calls[0][0],
  );
  expect(start.mock.calls[0][3]).toBe("nomi-dev");
  expect(result.server).toBe("https://nomi.ifuryst.com/api");
});

it("cancellation during exchange revokes the new session instead of adopting it", async () => {
  vi.spyOn(SyncClient.prototype, "browserStart").mockResolvedValue(request);
  const flow = new SyncBrowserLogin();
  vi.spyOn(SyncClient.prototype, "browserExchange").mockImplementation(
    async () => {
      flow.cancel();
      return login;
    },
  );
  const revoke = vi
    .spyOn(SyncClient.prototype, "revoke")
    .mockResolvedValue(undefined);
  await expect(
    flow.run("", "device.fixture", "Test Mac", true, async () => {}),
  ).rejects.toThrow();
  expect(revoke).toHaveBeenCalledWith("session.fixture");
});

it("a canceled request never opens a browser after a delayed start", async () => {
  const flow = new SyncBrowserLogin();
  vi.spyOn(SyncClient.prototype, "browserStart").mockImplementation(
    async () => {
      flow.cancel();
      return request;
    },
  );
  const open = vi.fn(async () => {});
  await expect(
    flow.run("", "device.fixture", "Test Mac", false, open),
  ).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
});

it("recovers from a connection drop before opening the browser and while waiting for sign-in", async () => {
  const start = vi
    .spyOn(SyncClient.prototype, "browserStart")
    .mockRejectedValueOnce(new TypeError("fetch failed"))
    .mockResolvedValue(request);
  const exchange = vi
    .spyOn(SyncClient.prototype, "browserExchange")
    .mockRejectedValueOnce(new Error("net::ERR_CONNECTION_RESET"))
    .mockResolvedValue(login);
  const open = vi.fn(async () => {});
  const result = await new SyncBrowserLogin().run(
    "",
    "device.fixture",
    "Test Mac",
    true,
    open,
  );
  expect(result.login).toEqual(login);
  expect(start).toHaveBeenCalledTimes(2);
  expect(exchange.mock.calls[0]).toEqual(exchange.mock.calls[1]);
  expect(open).toHaveBeenCalledTimes(1);
});
