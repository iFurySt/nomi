import { validStockCollection } from "@nomi/core";
import type { StockCollection } from "@nomi/core";
import type { StoragePort } from "./storage";
export const stockCollectionKey = "nomi.stock-collection.v1";
export function readStockCollection(storage: StoragePort): StockCollection {
  try {
    const value = storage.getItem(stockCollectionKey);
    return validStockCollection(value) ? value : "all-us";
  } catch {
    return "all-us";
  }
}
export function writeStockCollection(
  storage: StoragePort,
  collection: StockCollection,
) {
  if (!validStockCollection(collection))
    throw Error("Invalid stock collection.");
  try {
    storage.setItem(stockCollectionKey, collection);
    return true;
  } catch {
    return false;
  }
}
