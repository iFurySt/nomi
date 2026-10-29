import { validateDirectoryQuery, validDirectorySymbol } from "@nomi/core";
import type {
  DataMethod,
  StockDirectoryRepository,
  DirectoryPage,
  DirectoryLookup,
} from "@nomi/core";
import { requestLocalData } from "./data-service";
export type DirectoryTransport = (
  method: DataMethod,
  params?: unknown,
) => Promise<unknown>;
/** This adapter is the only stock reader that knows local host method names. */
export function createLocalStockDirectory(
  transport: DirectoryTransport = requestLocalData,
): StockDirectoryRepository {
  return {
    async search(query) {
      validateDirectoryQuery(query);
      return (await transport("directory.list", query)) as DirectoryPage;
    },
    async get(symbol) {
      if (!validDirectorySymbol(symbol))
        throw Error("Invalid directory symbol.");
      return (await transport("directory.get", { symbol })) as DirectoryLookup;
    },
  };
}
