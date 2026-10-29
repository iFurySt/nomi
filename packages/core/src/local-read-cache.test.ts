import { describe, expect, it, vi } from "vitest";
import { LocalReadCache } from "./local-read-cache";
import { DirectorySession } from "./directory-session";
import type { DirectoryPage, DirectoryEntry } from "./stock-directory";
const entry: DirectoryEntry = {
  id: "aapl",
  symbol: "AAPL",
  name: "Apple",
  exchangeCode: "Q",
  source: "nasdaqlisted",
  securityType: "unknown",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe("local presentation continuity", () => {
  it("deduplicates reads and keeps good data through pending and failed revalidation", async () => {
    const cache = new LocalReadCache<string>();
    cache.seed("A", "cached");
    const pending = deferred<string>();
    const read = vi.fn(() => pending.promise);
    const first = cache.read("A", read, 0);
    const second = cache.read("A", read, 0);
    expect(first).toBe(second);
    expect(cache.snapshot("A").data).toBe("cached");
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    pending.reject(Error("offline"));
    await expect(first).rejects.toThrow("offline");
    expect(cache.snapshot("A").data).toBe("cached");
    expect(cache.snapshot("A").pending).toBe(false);
    expect(cache.snapshot("B").data).toBeUndefined();
    expect(cache.snapshot("A")).toBe(cache.snapshot("A"));
  });
  it("pins active subscriptions when evicting and never evicts the snapshot being read", () => {
    const cache = new LocalReadCache<string>(1);
    const stop = cache.subscribe("A", () => {});
    cache.seed("A", "one");
    const b = cache.snapshot("B");
    expect(cache.snapshot("B")).toBe(b);
    expect(cache.snapshot("A").data).toBe("one");
    stop();
    cache.seed("C", "three");
    expect(cache.snapshot("C").data).toBe("three");
  });
  it("seeds stock identity before list rows resolve; revisits and concurrent headers make no extra lookup", async () => {
    const page: DirectoryPage = {
      scope: "candidates",
      snapshotId: "one",
      items: [entry],
      total: 1,
      offset: 0,
    };
    const source = {
      search: vi.fn(async () => page),
      get: vi.fn(async () => ({ snapshotId: "one", item: entry })),
    };
    const session = new DirectorySession(source);
    await session.search({ query: "", limit: 50, offset: 0 });
    expect(session.lookups.snapshot("AAPL").data?.item?.name).toBe("Apple");
    await session.get("AAPL");
    expect(source.get).not.toHaveBeenCalled();
    await session.search({ query: "", limit: 50, offset: 0 });
    expect(source.search).toHaveBeenCalledTimes(1);
    await session.refreshSearch({ query: "", limit: 50, offset: 0 });
    expect(source.search).toHaveBeenCalledTimes(2);
    expect(
      new DirectorySession(source).lookups.snapshot("AAPL").data,
    ).toBeUndefined();
  });
  it("isolates collection/query/membership caches and coalesces equivalent watchlist orders", async () => {
    const source = {
      search: vi.fn(async () => ({
        scope: "candidates" as const,
        snapshotId: "one",
        items: [],
        total: 0,
        offset: 0,
      })),
      get: vi.fn(),
    };
    const session = new DirectorySession(source);
    await session.search({
      collection: "watchlist",
      symbols: ["AAPL", "MSFT"],
      query: "",
      limit: 50,
      offset: 0,
    });
    await session.search({
      collection: "watchlist",
      symbols: ["MSFT", "AAPL"],
      query: "",
      limit: 50,
      offset: 0,
    });
    expect(source.search).toHaveBeenCalledTimes(1);
    await session.search({
      collection: "watchlist",
      symbols: ["MSFT"],
      query: "",
      limit: 50,
      offset: 0,
    });
    await session.search({
      collection: "all-us",
      query: "",
      limit: 50,
      offset: 0,
    });
    await session.search({
      collection: "all-us",
      query: "A",
      limit: 50,
      offset: 0,
    });
    expect(source.search).toHaveBeenCalledTimes(4);
  });
});

it("does not let a late lookup replace a newer identity seeded by a committed page", async () => {
  const cache = new LocalReadCache<string>();
  const old = deferred<string>();
  const work = cache.read("A", () => old.promise);
  cache.seed("A", "new committed identity");
  old.resolve("old lookup");
  await work;
  expect(cache.snapshot("A").data).toBe("new committed identity");
  expect(cache.snapshot("A").pending).toBe(false);
});

it("returns an existing local identity immediately while its stale revalidation is pending", async () => {
  const next = deferred<{ snapshotId: string; item: DirectoryEntry }>();
  const source = { search: vi.fn(), get: vi.fn(() => next.promise) };
  const session = new DirectorySession(source);
  session.lookups.seed("AAPL", { snapshotId: "old", item: entry }, 1);
  const immediate = await session.get("AAPL");
  expect(immediate.item?.name).toBe("Apple");
  expect(source.get).toHaveBeenCalledTimes(1);
  expect(session.lookups.snapshot("AAPL").pending).toBe(true);
  next.resolve({ snapshotId: "new", item: { ...entry, name: "Apple Inc." } });
  await next.promise;
  await Promise.resolve();
  await Promise.resolve();
  expect(session.lookups.snapshot("AAPL").data?.item?.name).toBe("Apple Inc.");
});
