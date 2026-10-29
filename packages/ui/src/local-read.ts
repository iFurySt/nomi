import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { LocalReadCache } from "@nomi/core";

/** Reuse cached content synchronously; only a first, uncached read is loading. */
export function useLocalRead<T>(
  cache: LocalReadCache<T>,
  key: string,
  read: () => Promise<T>,
  empty: T,
  delay = 0,
  enabled = true,
  refreshInterval = 60000,
) {
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(key, listener),
    [cache, key],
  );
  const snapshot = useCallback(() => cache.snapshot(key), [cache, key]);
  const state = useSyncExternalStore(subscribe, snapshot);
  const refresh = useCallback(() => {
    void cache.read(key, read, 0).catch(() => {});
  }, [cache, key, read]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      void cache.read(key, read).catch(() => {});
    }, delay);
    const interval = setInterval(refresh, refreshInterval);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [cache, key, read, delay, enabled, refresh, refreshInterval]);
  return {
    data: enabled ? (state.data ?? empty) : empty,
    loading: enabled && state.data === undefined && !state.error,
    refreshing: enabled && state.pending && state.data !== undefined,
    error: enabled ? state.error : "",
    retry: refresh,
  };
}
