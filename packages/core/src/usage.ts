/** Token subsets are included in input/output, not additional usage. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
}
export interface UsageRecord {
  requestId: string;
  profileId: string;
  conversationId: string;
  model: string;
  effort: string;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "succeeded" | "failed" | "cancelled";
  usage?: TokenUsage;
}
export interface UsageQuery {
  profileId?: string;
  days: 7 | 30 | 90 | 365 | 0;
  timezone: string;
}
export interface UsageBucket {
  key: string;
  requests: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  interrupted: number;
  running: number;
  measured: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cachedMeasured: number;
  reasoningMeasured: number;
  durationMs: number;
  longestMs: number;
}
export interface UsageStats {
  summary: UsageBucket;
  daily: UsageBucket[];
  models: UsageBucket[];
  efforts: UsageBucket[];
  accounts: UsageBucket[];
  conversations: UsageBucket[];
  firstRecordedAt?: number;
  conversationCount: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  peakDailyTokens: number;
  timezone: string;
  fromDay: string;
  throughDay: string;
}
