// Test-only renderer. Uses the actual App with delayed local repository reads.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../packages/ui/src/App";
import type {
  DirectoryEntry,
  DirectoryQuery,
  StockDirectoryRepository,
} from "../../packages/core/src/stock-directory";
import "../../packages/ui/src/styles.css";
const entries: DirectoryEntry[] = [
  ...[
    ["AAPL", "Apple"],
    ["MSFT", "Microsoft"],
    ["NVDA", "Nvidia"],
    ["GOOGL", "Alphabet"],
    ["AMD", "AMD"],
  ].map(([symbol, name]) => ({
    id: symbol!,
    symbol: symbol!,
    name: name!,
    source: "nasdaqlisted",
    exchangeCode: "Q",
    securityType: "unknown",
  })),
  ...Array.from({ length: 175 }, (_, i) => ({
    id: `S${String(i).padStart(3, "0")}`,
    symbol: `S${String(i).padStart(3, "0")}`,
    name: `Example ${i}`,
    source: "nasdaqlisted",
    exchangeCode: "Q",
    securityType: "unknown",
  })),
];
const stats = { search: 0, get: 0, research: 0, generation: 1 };
Object.assign(window, { continuity: stats });
// Synthetic desktop capability for renderer regression only. It never opens a
// browser, reads a real credential, or sends inference requests.
const chatListeners = new Set<
  (value: { requestId: string; text: string }) => void
>();
const chatFixture = { failure: false, cancelled: false, delay: 40 };
Object.assign(window, { chatFixture });
window.nomiDesktop = {
  getRuntimeInfo: async () => ({
    kind: "web",
    version: "test",
    platform: "fixture",
  }),
  requestData: async () => {
    throw Error("Fixture data bridge is unavailable.");
  },
  onChatGPTDelta: (callback) => {
    chatListeners.add(callback);
    return () => chatListeners.delete(callback);
  },
  requestChatGPT: async (method, params) => {
    if (method === "status")
      return {
        ok: true,
        value: {
          activeProfileId: "fixture-profile",
          welcomeSeen: true,
          signingIn: false,
          profiles: [
            {
              id: "fixture-profile",
              label: "Test account",
              email: "test@example.invalid",
              connected: true,
              sharing: true,
            },
          ],
        },
      };
    if (method === "models")
      return {
        ok: true,
        value: [{ slug: "fixture-model", displayName: "Fixture model" }],
      };
    if (method === "cancelResponse") {
      chatFixture.cancelled = true;
      return { ok: true, value: undefined };
    }
    if (method === "respond") {
      chatFixture.cancelled = false;
      const { requestId } = params as { requestId: string };
      await new Promise((resolve) => setTimeout(resolve, chatFixture.delay));
      for (const listener of chatListeners)
        listener({ requestId, text: "Synthetic streamed reply." });
      await new Promise((resolve) => setTimeout(resolve, chatFixture.delay));
      return chatFixture.cancelled || chatFixture.failure
        ? { ok: false, error: "Synthetic interrupted response." }
        : { ok: true, value: { text: "Synthetic streamed reply." } };
    }
    return { ok: true, value: undefined };
  },
};
const wait = () => new Promise((resolve) => setTimeout(resolve, 100));
const directory: StockDirectoryRepository = {
  async search(query: DirectoryQuery) {
    stats.search++;
    await wait();
    let items = entries;
    if (query.collection === "watchlist")
      items = items.filter((entry) => query.symbols?.includes(entry.symbol));
    if (query.query)
      items = items.filter((entry) =>
        `${entry.symbol} ${entry.name}`
          .toLowerCase()
          .includes(query.query.toLowerCase()),
      );
    return {
      scope: "candidates",
      snapshotId: `fixture-${stats.generation}`,
      offset: query.offset,
      total: items.length,
      items: items.slice(query.offset, query.offset + query.limit),
    };
  },
  async get(symbol: string) {
    stats.get++;
    await wait();
    return {
      snapshotId: `fixture-${stats.generation}`,
      item: entries.find((e) => e.symbol === symbol) ?? null,
    };
  },
};
const stockResearch = {
  async get(symbol: string) {
    stats.research++;
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        symbol === "GOOGL" ? 250 : symbol === "AMD" ? 50 : 100,
      ),
    );
    const price = symbol === "MSFT" ? 400 : 200;
    return {
      symbol,
      basis: "raw" as const,
      datasets: {},
      coverage: {},
      bars: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        open: price + i,
        close: price + i + 1,
        high: price + i + 2,
        low: price + i - 1,
        volume: 1000000,
      })),
    };
  },
};
if (!location.hash) location.hash = "/stocks/AAPL/chart";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App
      directory={directory}
      stockResearch={stockResearch}
      logos={{
        get: async () => null,
        getCached: async () => [],
        peek: () => null,
      }}
    />
  </React.StrictMode>,
);
