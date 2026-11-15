import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncDeviceCache } from "./sync-device-cache";

const folders: string[] = [];
const codec = {
  encrypt: (text: string) => Buffer.from(text).reverse(),
  decrypt: (data: Buffer) => Buffer.from(data).reverse().toString(),
};
const device = {
  id: "session.test",
  deviceId: "device.test",
  deviceName: "Test Mac",
  createdAt: "2026-11-15T00:00:00Z",
  expiresAt: "2026-12-15T00:00:00Z",
  current: true,
};
async function setup() {
  const folder = await mkdtemp(join(tmpdir(), "nomi-device-cache-"));
  folders.push(folder);
  const file = join(folder, "devices.enc");
  return {
    file,
    cache: await SyncDeviceCache.open(file, codec, "account-a/session-a"),
  };
}
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((f) => rm(f, { recursive: true, force: true })),
  );
});

it("persists through restart, scopes by account/session, and preserves devices offline", async () => {
  const { file, cache } = await setup();
  await cache.refresh(async () => [device]);
  expect((await readFile(file)).includes(Buffer.from(device.deviceName))).toBe(
    false,
  );
  const reopened = await SyncDeviceCache.open(
    file,
    codec,
    "account-a/session-a",
  );
  expect(reopened.value).toEqual([device]);
  await expect(
    reopened.refresh(async () => {
      throw Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(reopened.value).toEqual([device]);
  const different = await SyncDeviceCache.open(
    file,
    codec,
    "account-b/session-b",
  );
  expect(different.value).toBeUndefined();
  await expect(readFile(file)).rejects.toThrow();
});

it("deduplicates pending refreshes without hiding cached rows", async () => {
  const { cache } = await setup();
  await cache.refresh(async () => [device]);
  let finish!: (v: (typeof device)[]) => void;
  const load = vi.fn(
    () =>
      new Promise<(typeof device)[]>((r) => {
        finish = r;
      }),
  );
  const a = cache.refresh(load),
    b = cache.refresh(load);
  expect(a).toBe(b);
  expect(load).toHaveBeenCalledTimes(1);
  expect(cache.value).toEqual([device]);
  finish([]);
  await a;
  expect(cache.value).toEqual([]);
});

it("a slow response cannot resurrect a revoked device or a logged-out account", async () => {
  const { file, cache } = await setup();
  await cache.refresh(async () => [device]);
  let finish!: (v: (typeof device)[]) => void;
  let pending = cache.refresh(
    () =>
      new Promise<(typeof device)[]>((r) => {
        finish = r;
      }),
  );
  const rejected = expect(pending).rejects.toThrow("Device list changed");
  await cache.remove(device.id);
  finish([device]);
  await rejected;
  expect(cache.value).toEqual([]);
  expect(
    (await SyncDeviceCache.open(file, codec, "account-a/session-a")).value,
  ).toEqual([]);
  pending = cache.refresh(
    () =>
      new Promise<(typeof device)[]>((r) => {
        finish = r;
      }),
  );
  const loggedOut = expect(pending).rejects.toThrow("Device list changed");
  await cache.reset();
  finish([device]);
  await loggedOut;
  expect(cache.value).toBeUndefined();
  await expect(readFile(file)).rejects.toThrow();
});
