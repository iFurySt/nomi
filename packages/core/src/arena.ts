import type { ChatGPTEffort } from "./chatgpt";
export const arenaMethods = [
  "run",
  "cancel",
  "auto.start",
  "auto.pause",
] as const;
export type ArenaMethod = (typeof arenaMethods)[number];
export interface ArenaRunRequest {
  episodeId: string;
  profileId: string;
  model: string;
  effort?: ChatGPTEffort;
}
export interface ArenaAutoRequest extends ArenaRunRequest {
  intervalSeconds: number;
  maxRounds: number;
}
export interface ArenaAutomation {
  id: string;
  enabled: boolean;
  profileId: string;
  model: string;
  effort?: ChatGPTEffort;
  intervalSeconds: number;
  maxRounds: number;
  completed: number;
  startedAt: string;
  nextRunAt?: string;
  reason?: string;
}
export interface ArenaFill {
  id: string;
  runId: string;
  day: number;
  symbol: string;
  side: "buy" | "sell";
  quantityMicros: number;
  priceCents: number;
  grossCents: number;
  feeCents: number;
  cashDeltaCents: number;
  realizedCents: number;
}
export interface ArenaDecision {
  runId: string;
  model: string;
  day: number;
  status: string;
  action: string;
  thesis: string;
  evidence: string[];
  summary: string;
  startedAt: string;
  finishedAt: string;
  fillIds: string[];
}
export interface ArenaEpisode {
  automation?: ArenaAutomation;
  id: string;
  name: string;
  createdAt: string;
  mode: "synthetic";
  initialCashCents: number;
  cashCents: number;
  revision: number;
  day: number;
  assets: {
    symbol: string;
    name: string;
    sector: string;
    priceCents: number;
    initialPriceCents: number;
    changeBps: number;
  }[];
  positions: {
    symbol: string;
    quantityMicros: number;
    costCents: number;
    realizedCents: number;
  }[];
  marks: {
    day: number;
    equityCents: number;
    cashCents: number;
    benchmarkCents: number;
    recordedAt: string;
  }[];
  fills: ArenaFill[];
  decisions: ArenaDecision[];
  run?: {
    id: string;
    model: string;
    effort: string;
    status: string;
    startedAt: string;
    deadline: string;
    summary?: string;
  };
}
export interface ArenaView {
  episode: ArenaEpisode | null;
  performance?: {
    equityUSD: string;
    pnlUSD: string;
    returnBps: number;
    maxDrawdownBps: number;
    feesUSD: string;
    tradeCount: number;
    marketDay: number;
    benchmark: string;
  };
}
