import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { withPreparedStockLogos } from "./stock-logo-page";
import { DirectoryFeedCache } from "./directory-feed-cache";
import { DirectorySession, directoryQueryKey } from "@nomi/core";
import { useLocalRead } from "./local-read";
import type {
  StockDirectoryRepository,
  StockCollection,
  StockLogoRepository,
  DirectoryPage,
  DirectoryLookup,
} from "@nomi/core";

export const StockDirectoryContext =
  createContext<StockDirectoryRepository | null>(null);
export const StockLogoContext = createContext<StockLogoRepository | null>(null);
export function useStockDirectory() {
  const repository = useContext(StockDirectoryContext);
  if (!repository) throw Error("Stock directory repository is missing.");
  return directorySession(repository);
}
const emptyPage: DirectoryPage = {
  snapshotId: "",
  scope: "candidates",
  total: 0,
  offset: 0,
  items: [],
};
const emptyLookup: DirectoryLookup = { snapshotId: "", item: null };
const sessions = new WeakMap<StockDirectoryRepository, DirectorySession>();
export function directorySession(repository: StockDirectoryRepository) {
  if (repository instanceof DirectorySession) return repository;
  let session = sessions.get(repository);
  if (!session) {
    session = new DirectorySession(repository);
    sessions.set(repository, session);
  }
  return session;
}
export function useDirectorySearch(
  query: string,
  limit = 50,
  offset = 0,
  enabled = true,
) {
  const session = directorySession(useStockDirectory());
  const input = useMemo(
    () => ({ query: query.trim(), limit, offset }),
    [query, limit, offset],
  );
  const read = useCallback(() => session.loadSearch(input), [session, input]);
  return useLocalRead(
    session.searches,
    directoryQueryKey(input),
    read,
    emptyPage,
    180,
    enabled,
  );
}
export function useDirectoryEntry(symbol: string) {
  const session = directorySession(useStockDirectory());
  const read = useCallback(() => session.loadLookup(symbol), [session, symbol]);
  return useLocalRead(session.lookups, symbol.toUpperCase(), read, emptyLookup);
}
export function directoryExchange(entry: { exchangeCode: string }) {
  return (
    (
      {
        N: "NYSE",
        A: "NYSE American",
        P: "NYSE Arca",
        Z: "Cboe BZX",
        V: "IEX",
        Q: "NASDAQ",
      } as Record<string, string>
    )[entry.exchangeCode] ?? entry.exchangeCode
  );
}

const feedCaches = new WeakMap<
  StockDirectoryRepository,
  Map<StockLogoRepository | null, DirectoryFeedCache>
>();
function directoryFeeds(
  repository: StockDirectoryRepository,
  logos: StockLogoRepository | null,
) {
  let caches = feedCaches.get(repository);
  if (!caches) {
    caches = new Map();
    feedCaches.set(repository, caches);
  }
  let cache = caches.get(logos);
  if (!cache) {
    cache = new DirectoryFeedCache(repository, (source) =>
      withPreparedStockLogos(source, logos),
    );
    caches.set(logos, cache);
  }
  return cache;
}
/** Warm the selected local list at app boot, even if Chat/Settings opens first. */
export function useDirectoryWarmup(
  repository: StockDirectoryRepository,
  logos: StockLogoRepository | null,
  collection: StockCollection,
  watchlist: string[],
) {
  const personal =
    collection === "watchlist"
      ? JSON.stringify([...new Set(watchlist)].sort())
      : "[]";
  useEffect(() => {
    const view = directoryFeeds(directorySession(repository), logos).view(
      "",
      collection,
      JSON.parse(personal),
    );
    void view.ensure();
  }, [repository, logos, collection, personal]);
}

export function useDirectoryFeed(
  query: string,
  collection: StockCollection = "all-us",
  watchlist: string[] = [],
) {
  const directory = useStockDirectory();
  const logos = useContext(StockLogoContext);
  const trimmed = query.trim();
  const view = directoryFeeds(directory, logos).view(
    trimmed,
    collection,
    watchlist,
  );
  const { state, preview } = useSyncExternalStore(
    view.subscribe,
    view.snapshot,
  );
  useEffect(() => {
    const timer = setTimeout(() => void view.ensure(), trimmed ? 180 : 0);
    const interval = setInterval(() => void view.ensure(), 60000);
    const focus = () => void view.ensure();
    window.addEventListener("focus", focus);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      // Keep in-flight local work alive: its result remains useful after navigation.
    };
  }, [view, trimmed]);
  const rememberScroll = useCallback(
    (top: number) => {
      view.scrollTop = top;
    },
    [view],
  );
  return {
    ...state,
    preview,
    ...(collection === "watchlist" && !watchlist.length
      ? {
          items: [],
          total: 0,
          hasMore: false,
          loading: false,
          loadingMore: false,
        }
      : {}),
    loadMore: view.loadMore,
    retry: view.retry,
    scrollTop: view.scrollTop,
    rememberScroll,
  };
}
