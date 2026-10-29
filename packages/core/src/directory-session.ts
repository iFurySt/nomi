import { LocalReadCache } from "./local-read-cache";
import {
  validDirectorySymbol,
  validateDirectoryQuery,
} from "./stock-directory";
import type {
  DirectoryLookup,
  DirectoryPage,
  DirectoryQuery,
  StockDirectoryRepository,
} from "./stock-directory";

export function directoryQueryKey(query: DirectoryQuery) {
  return JSON.stringify([
    query.collection ?? "all-us",
    query.collection === "watchlist"
      ? [...new Set(query.symbols ?? [])].sort()
      : [],
    query.query.trim(),
    query.limit,
    query.offset,
  ]);
}
/** Repository-scoped session state; SQLite remains authoritative. */
export class DirectorySession implements StockDirectoryRepository {
  readonly lookups = new LocalReadCache<DirectoryLookup>(1024);
  readonly searches = new LocalReadCache<DirectoryPage>(64);
  constructor(private source: StockDirectoryRepository) {}
  async loadSearch(query: DirectoryQuery) {
    validateDirectoryQuery(query);
    const page = await this.source.search(query);
    for (const item of page.items)
      this.lookups.seed(item.symbol, { snapshotId: page.snapshotId, item });
    return page;
  }
  search(query: DirectoryQuery) {
    validateDirectoryQuery(query);
    return this.searches.read(directoryQueryKey(query), () =>
      this.loadSearch(query),
    );
  }
  loadLookup(symbol: string) {
    return this.source.get(symbol.toUpperCase());
  }
  get(symbol: string) {
    if (!validDirectorySymbol(symbol)) throw Error("Invalid stock symbol.");
    const key = symbol.toUpperCase();
    const stored = this.lookups.snapshot(key).data;
    const request = this.lookups.read(key, () => this.loadLookup(key));
    if (stored !== undefined) {
      void request.catch(() => {});
      return Promise.resolve(stored);
    }
    return request;
  }
  refreshSearch(query: DirectoryQuery) {
    validateDirectoryQuery(query);
    return this.searches.read(
      directoryQueryKey(query),
      () => this.loadSearch(query),
      0,
    );
  }
}
