import { DashboardSkeleton } from "../components/Skeleton";
import { Select } from "../components/Select";
import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { UsageStats, UsageQuery, UsageBucket } from "@nomi/core";
import { requestLocalData } from "@nomi/platform";
import { useChatGPT } from "../chatgpt-context";
import { useWorkspace } from "../workspace-context";
import { Button } from "../components/primitives";
const number = (n: number) => n.toLocaleString();
const compact = (n: number) =>
  Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const duration = (n: number) =>
  n >= 60000 ? `${(n / 60000).toFixed(1)}m` : `${(n / 1000).toFixed(1)}s`;
export function Usage() {
  const { status, action } = useChatGPT();
  const { workspace } = useWorkspace();
  const active = status?.profiles.find((p) => p.id === status.activeProfileId);
  const [account, setAccount] = useState<string | undefined>();
  const profileId = account ?? active?.id ?? "";
  const profile = status?.profiles.find((p) => p.id === profileId);
  const [days, setDays] = useState<UsageQuery["days"]>(0);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const requestKey = JSON.stringify([profileId, days, timezone]);
  const [snapshot, setSnapshot] = useState<{ key: string; data: UsageStats }>();
  const stats = snapshot?.key === requestKey ? snapshot.data : undefined;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [dimension, setDimension] = useState<
    "models" | "efforts" | "accounts" | "conversations" | "daily"
  >("models");
  const [metric, setMetric] = useState<"totalTokens" | "requests">(
    "totalTokens",
  );
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    void requestLocalData("usage.read", {
      ...(profileId ? { profileId } : {}),
      days,
      timezone,
    })
      .then((value) => {
        if (current)
          setSnapshot({ key: requestKey, data: value as UsageStats });
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [profileId, days, timezone, revision]);
  const s = stats?.summary;
  const completed = s ? s.succeeded + s.failed + s.cancelled : 0;
  const labels: Record<string, string> = {
    daily: "Date",
    models: "Model",
    efforts: "Reasoning effort",
    accounts: "Account",
    conversations: "Conversation",
  };
  const bucketName = (b: UsageBucket) =>
    dimension === "accounts"
      ? status?.profiles.find((p) => p.id === b.key)?.email || "Saved account"
      : dimension === "conversations"
        ? workspace.conversations.find((c) => c.id === b.key)?.title ||
          "Saved conversation"
        : b.key;
  const peak = Math.max(1, ...(stats?.daily.map((b) => b[metric]) ?? []));
  return (
    <div className="usage-page">
      <header className="usage-toolbar">
        <h1>Usage</h1>
        <Button
          variant="ghost"
          disabled={loading}
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={15} />
          Refresh
        </Button>
      </header>
      <div className="usage-identity">
        <span className="usage-avatar">
          {(profile?.name || profile?.email || "A").slice(0, 1).toUpperCase()}
        </span>
        <h2>{profile?.name || (profileId ? "ChatGPT account" : "Nomi")}</h2>
        {profile?.email && <p>{profile.email}</p>}
        <span className="muted">Nomi activity</span>
      </div>
      <div className="usage-filters">
        <label>
          Account
          <Select
            label="Usage account"
            align="start"
            value={profileId}
            onValueChange={setAccount}
            searchable
            options={[
              { value: "", label: "All accounts" },
              ...(status?.profiles ?? []).map((p) => ({
                value: p.id,
                label: p.email || p.name || p.label,
              })),
            ]}
          />
        </label>
        <label>
          Period
          <Select
            label="Usage period"
            align="start"
            value={String(days)}
            onValueChange={(value) =>
              setDays(Number(value) as UsageQuery["days"])
            }
            options={[
              { value: "0", label: "All time" },
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
              { value: "365", label: "Last year" },
            ]}
          />
        </label>
        <Button variant="ghost" onClick={() => void action("openUsage")}>
          ChatGPT plan usage
          <ExternalLink size={14} />
        </Button>
      </div>
      {!stats && !error && <DashboardSkeleton label="Loading activity" />}
      {error && (
        <div className="chat-error" role="alert">
          {error}
          <Button onClick={() => setRevision((n) => n + 1)}>Retry</Button>
        </div>
      )}
      {stats && s && (
        <>
          <div className="usage-metrics">
            {[
              [
                s.requests > 0 && !s.measured ? "—" : compact(s.totalTokens),
                "Recorded tokens",
              ],
              [number(s.requests), "Requests"],
              [number(stats.conversationCount), "Conversations"],
              [
                s.requests > 0 && !completed ? "—" : duration(s.longestMs),
                "Longest request",
              ],
              [
                `${stats.currentStreak} ${stats.currentStreak === 1 ? "day" : "days"}`,
                "Current streak",
              ],
            ].map(([v, l]) => (
              <div key={l}>
                <strong>{v}</strong>
                <span>{l}</span>
              </div>
            ))}
          </div>
          <p className="usage-scope">
            Only activity in Nomi on this device. {s.measured} of {s.requests}{" "}
            requests returned token usage. Each request is one submitted chat
            turn, including its internal model and tool steps.{" "}
            {stats.firstRecordedAt
              ? `First recorded in this period: ${new Date(stats.firstRecordedAt).toLocaleDateString()}.`
              : "Activity will appear after your first request."}{" "}
            ChatGPT’s remaining allowance is available in plan usage.
          </p>
          <section className="usage-section">
            <div className="usage-section-heading">
              <h2>Activity</h2>
              <div className="segmented-control" aria-label="Activity metric">
                {(["totalTokens", "requests"] as const).map((m) => (
                  <button
                    key={m}
                    aria-pressed={metric === m}
                    className={metric === m ? "selected" : ""}
                    onClick={() => setMetric(m)}
                  >
                    {m === "totalTokens" ? "Tokens" : "Requests"}
                  </button>
                ))}
              </div>
            </div>
            <div className="usage-heatmap-scroll">
              <div
                className="usage-heatmap"
                role="img"
                aria-label={`${metric === "totalTokens" ? "Recorded tokens" : "Requests"} by day, ${stats.fromDay} through ${stats.throughDay}, ${stats.timezone}`}
              >
                {Array.from(
                  {
                    length: new Date(`${stats.fromDay}T00:00:00Z`).getUTCDay(),
                  },
                  (_, i) => (
                    <span className="heat-spacer" key={`space-${i}`} />
                  ),
                )}
                {stats.daily.map((b) => (
                  <span
                    key={b.key}
                    className={`heat-cell level-${b.requests === 0 ? 0 : metric === "totalTokens" && b.measured === 0 ? "unknown" : Math.max(1, Math.ceil((b[metric] / peak) * 4))}`}
                    title={`${b.key} · ${number(b.requests)} requests · ${b.measured ? number(b.totalTokens) + " recorded tokens" : "token usage unavailable"}`}
                    aria-label={`${b.key}: ${b.requests} requests, ${b.totalTokens} recorded tokens, ${b.requests - b.measured} unmeasured`}
                  />
                ))}
              </div>
            </div>
            <div className="heatmap-caption">
              <span>
                {stats.fromDay} — {stats.throughDay} · {stats.timezone}
              </span>
              <span>
                Less <i className="heat-cell level-0" />
                <i className="heat-cell level-2" />
                <i className="heat-cell level-4" /> More
              </span>
            </div>
          </section>
          <section className="usage-section">
            <div className="usage-section-heading">
              <h2>Breakdown</h2>
              <Select
                label="Usage breakdown"
                value={dimension}
                onValueChange={setDimension}
                options={(Object.keys(labels) as (typeof dimension)[]).map(
                  (key) => ({ value: key, label: labels[key]! }),
                )}
              />
            </div>
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>{labels[dimension]}</th>
                    <th>Requests</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Total tokens</th>
                    <th>Measured</th>
                  </tr>
                </thead>
                <tbody>
                  {stats[dimension].map((b) => (
                    <tr key={b.key}>
                      <td title={bucketName(b)}>{bucketName(b)}</td>
                      <td>{number(b.requests)}</td>
                      <td>{b.measured ? number(b.inputTokens) : "—"}</td>
                      <td>{b.measured ? number(b.outputTokens) : "—"}</td>
                      <td>{b.measured ? number(b.totalTokens) : "—"}</td>
                      <td>
                        {b.measured}/{b.requests}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!s.requests && (
                <p className="usage-empty">
                  No activity in this period. Start a chat to see your usage
                  here.
                </p>
              )}
            </div>
            <p className="usage-scope">
              {dimension === "daily"
                ? "Daily activity in the displayed calendar."
                : "Top 100 by recorded tokens. Totals include all matching requests."}
            </p>
          </section>
          <section className="usage-section">
            <h2>Details</h2>
            <dl className="usage-details">
              {[
                ["Input tokens", s.measured ? number(s.inputTokens) : "—"],
                [
                  "Cached input tokens",
                  s.cachedMeasured ? number(s.cachedTokens) : "—",
                ],
                ["Output tokens", s.measured ? number(s.outputTokens) : "—"],
                [
                  "Reasoning output tokens",
                  s.reasoningMeasured ? number(s.reasoningTokens) : "—",
                ],
                ["Succeeded / failed", `${s.succeeded} / ${s.failed}`],
                [
                  "Stopped / interrupted / running",
                  `${s.cancelled} / ${s.interrupted} / ${s.running}`,
                ],
                [
                  "Average completed request",
                  completed ? duration(s.durationMs / completed) : "—",
                ],
                [
                  "Active days / longest streak",
                  `${stats.activeDays} / ${stats.longestStreak}`,
                ],
                ["Peak daily recorded tokens", number(stats.peakDailyTokens)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="usage-scope">
              Cached tokens are part of input; reasoning tokens are part of
              output. Unknown usage is excluded from token totals. Durations
              include response time, including failed and stopped requests.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
