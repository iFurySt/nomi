// UI-only synthetic records; ledger correctness is exercised against real Go SQLite separately.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../packages/ui/src/App";
import type { ArenaView, ChatGPTDelta } from "@nomi/core";
import "../../packages/ui/src/styles.css";
location.hash = "/arena";
const listeners = new Set<(e: ChatGPTDelta) => void>();
const fixture = { delay: 1700, cancel: false, reads: 0 };
Object.assign(window, { arenaFixture: fixture });
let state: ArenaView = { episode: null };
let autoTimer: ReturnType<typeof setTimeout> | undefined;
async function autoRound() {
  const a = state.episode?.automation;
  if (!a?.enabled) return;
  const delay = fixture.delay;
  fixture.delay = 80;
  await window.nomiDesktop!.requestArena!("run", {});
  fixture.delay = delay;
  if (!a.enabled) return;
  a.completed++;
  a.enabled = a.completed < a.maxRounds;
  a.reason = a.enabled ? "" : "Round limit reached";
  a.nextRunAt = new Date(Date.now() + 1000).toISOString();
  if (a.enabled) autoTimer = setTimeout(() => void autoRound(), 1000);
}

function fresh(): ArenaView {
  return {
    episode: {
      id: "a".repeat(32),
      name: "ChatGPT",
      createdAt: new Date().toISOString(),
      mode: "synthetic",
      initialCashCents: 1e6,
      cashCents: 1e6,
      revision: 0,
      day: 0,
      assets: [
        ["AAPL", "Apple", 20000],
        ["JPM", "JPMorgan Chase", 20000],
        ["JNJ", "Johnson & Johnson", 15000],
        ["XOM", "Exxon Mobil", 10000],
      ].map(([symbol, name, price]) => ({
        symbol: symbol as string,
        name: name as string,
        sector: "Fixture",
        priceCents: price as number,
        initialPriceCents: price as number,
        changeBps: 0,
      })),
      positions: [],
      marks: [
        {
          day: 0,
          equityCents: 1e6,
          cashCents: 1e6,
          benchmarkCents: 1e6,
          recordedAt: new Date().toISOString(),
        },
      ],
      fills: [],
      decisions: [],
    },
    performance: {
      equityUSD: "10000.00",
      pnlUSD: "0.00",
      returnBps: 0,
      maxDrawdownBps: 0,
      feesUSD: "0.00",
      tradeCount: 0,
      marketDay: 0,
      benchmark: "synthetic market",
    },
  };
}
const clone = () => structuredClone(state);
window.nomiDesktop = {
  getRuntimeInfo: async () => ({
    kind: "desktop",
    version: "fixture",
    platform: "darwin",
  }),
  requestData: async (method) => {
    if (method === "arena.read") {
      fixture.reads++;
      return clone();
    }
    if (method === "arena.create") {
      state = fresh();
      return clone();
    }
    if (method === "arena.advance") {
      const e = state.episode!;
      e.day++;
      e.marks.push({ ...e.marks.at(-1)!, day: e.day });
      return clone();
    }
    throw Error("No source collection in Arena fixture.");
  },
  onChatGPTDelta: (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  requestChatGPT: async (method) => {
    if (method === "status")
      return {
        ok: true,
        value: {
          activeProfileId: "fixture",
          welcomeSeen: true,
          signingIn: false,
          profiles: [
            { id: "fixture", label: "Fixture", connected: true, sharing: true },
          ],
        },
      };
    if (method === "models")
      return {
        ok: true,
        value: [
          {
            slug: "fixture-model",
            displayName: "GPT Fixture",
            reasoningEfforts: ["low", "medium"],
            defaultEffort: "low",
          },
        ],
      };
    return { ok: true, value: undefined };
  },
  requestArena: async (method, params) => {
    if (method === "auto.start") {
      const p = params as any;
      state.episode!.automation = {
        id: "fixture-auto-" + state.episode!.day,
        enabled: true,
        profileId: p.profileId,
        model: p.model,
        effort: p.effort,
        intervalSeconds: p.intervalSeconds,
        maxRounds: p.maxRounds,
        completed: 0,
        startedAt: new Date().toISOString(),
        nextRunAt: new Date().toISOString(),
      };
      autoTimer = setTimeout(() => void autoRound(), 100);
      return { ok: true, value: clone() };
    }
    if (method === "auto.pause") {
      clearTimeout(autoTimer);
      fixture.cancel = true;
      state.episode!.automation!.enabled = false;
      state.episode!.automation!.reason = "Paused by you";
      return { ok: true, value: clone() };
    }
    if (method === "cancel") {
      fixture.cancel = true;
      return { ok: true, value: undefined };
    }
    fixture.cancel = false;
    const e = state.episode!,
      runId = `run-${e.decisions.length}`,
      startedAt = new Date().toISOString();
    e.run = {
      id: runId,
      model: "fixture-model",
      effort: "low",
      status: "running",
      startedAt,
      deadline: new Date(Date.now() + 600000).toISOString(),
    };
    const timer = setInterval(() => {
      for (const cb of listeners)
        cb({
          requestId: runId,
          text: "",
          item: {
            id: "preview",
            kind: "tool",
            status: "running",
            title: "Preview allocation",
          },
        });
    }, 5);
    await new Promise((r) => setTimeout(r, fixture.delay));
    clearInterval(timer);
    const first = e.decisions.length === 0,
      day = e.day;
    if (!fixture.cancel) {
      e.day++;
      if (first) {
        e.cashCents = 199000;
        e.positions = e.assets.map((a) => ({
          symbol: a.symbol,
          quantityMicros: 10e6,
          costCents: a.priceCents * 10,
          realizedCents: 0,
        }));
        e.fills = e.assets.map((a, i) => ({
          id: String(i),
          runId,
          day: e.day,
          symbol: a.symbol,
          side: "buy",
          quantityMicros: 10e6,
          priceCents: a.priceCents,
          grossCents: a.priceCents * 10,
          feeCents: 50,
          cashDeltaCents: -a.priceCents * 10 - 50,
          realizedCents: 0,
        }));
        state.performance = {
          ...state.performance!,
          equityUSD: "10010.00",
          pnlUSD: "10.00",
          returnBps: 10,
          feesUSD: "2.00",
          tradeCount: 4,
        };
      }
      e.marks.push({
        day: e.day,
        equityCents: 1001000 + e.day * 1000,
        cashCents: e.cashCents,
        benchmarkCents: 1000000 + e.day * 3500,
        recordedAt: new Date().toISOString(),
      });
    }
    e.run.status = fixture.cancel ? "cancelled" : "completed";
    e.decisions.push({
      runId,
      model: "fixture-model",
      day,
      status: e.run.status,
      action: fixture.cancel ? "error" : first ? "rebalance" : "hold",
      thesis: fixture.cancel
        ? ""
        : "Diversify this virtual account across technology, financials, healthcare and energy. Main risk: synthetic market declines.",
      evidence: [],
      summary: fixture.cancel
        ? "Session cancelled; portfolio unchanged."
        : "Virtual decision accepted.",
      startedAt,
      finishedAt: new Date().toISOString(),
      fillIds: e.fills.filter((f) => f.runId === runId).map((f) => f.id),
    });
    return { ok: true, value: clone() };
  },
};
createRoot(document.getElementById("root")!).render(<App />);
