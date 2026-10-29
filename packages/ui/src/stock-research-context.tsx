import { createContext, useCallback, useContext, useMemo } from "react";
import {
  emptyResearch,
  LocalReadCache,
  type StockResearch,
  type StockResearchRepository,
} from "@nomi/core";
import { createLocalStockResearch } from "@nomi/platform";
import { useLocalRead } from "./local-read";
export const StockResearchContext = createContext<StockResearchRepository>(
  createLocalStockResearch(),
);
const caches = new WeakMap<
  StockResearchRepository,
  LocalReadCache<StockResearch>
>();
function researchCache(repository: StockResearchRepository) {
  let cache = caches.get(repository);
  if (!cache) {
    cache = new LocalReadCache<StockResearch>(24);
    caches.set(repository, cache);
  }
  return cache;
}
async function readStock(repository: StockResearchRepository, symbol: string) {
  const data = await repository.get(symbol);
  if (data.symbol !== symbol)
    throw Error("Stock response does not match its request.");
  return data;
}
/** Prime the next route before committing it; cached local reads deduplicate. */
export function prepareStockResearch(
  repository: StockResearchRepository,
  symbol: string,
) {
  const cache = researchCache(repository);
  const stored = cache.snapshot(symbol).data;
  const request = cache.read(symbol, () => readStock(repository, symbol));
  if (stored !== undefined) {
    // A stale session value is still a valid committed local snapshot. Navigation
    // must not wait for revalidation or lose it when the bridge is unavailable.
    void request.catch(() => {});
    return Promise.resolve(stored);
  }
  return request;
}
export function useStockResearch(symbol: string) {
  const repository = useContext(StockResearchContext);
  const read = useCallback(
    () => readStock(repository, symbol),
    [repository, symbol],
  );
  const empty = useMemo(() => emptyResearch(symbol), [symbol]);
  return useLocalRead(
    researchCache(repository),
    symbol,
    read,
    empty,
    0,
    true,
    30000,
  );
}
