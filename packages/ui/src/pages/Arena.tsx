import { useCallback, useEffect, useRef, useState, memo } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Play,
  Square,
  RefreshCw,
  Trophy,
  Wallet,
  Info,
  Plus,
  Repeat2,
  Pause,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import type {
  ArenaView,
  ArenaEpisode,
  ArenaDecision,
  ChatGPTDelta,
  ChatGPTEffort,
  ArenaAutomation,
} from "@nomi/core";
import {
  requestLocalData,
  runArena,
  cancelArena,
  requestChatGPT,
  startArenaAuto,
  pauseArenaAuto,
} from "@nomi/platform";
import { useChatGPT } from "../chatgpt-context";
import { useWorkspace } from "../workspace-context";
import { Button, Modal } from "../components/primitives";
import { StockAvatar } from "../components/StockAvatar";
import { Select } from "../components/Select";
import { ChatMarkdown } from "../components/ChatContent";
import { DashboardSkeleton } from "../components/Skeleton";
import "./arena.css";
const usd = (c: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(c / 100);
const pct = (bp: number) => `${bp > 0 ? "+" : ""}${(bp / 100).toFixed(2)}%`;
const running = (e?: ArenaEpisode | null) =>
  !!e?.run && ["running", "submitted"].includes(e.run.status);

export const ArenaChart = memo(function ArenaChart({
  episode: e,
}: {
  episode: ArenaEpisode;
}) {
  const [point, setPoint] = useState<number>();
  const [mode, setMode] = useState("Value");
  const marks = e.marks,
    selected = marks[Math.min(point ?? marks.length - 1, marks.length - 1)];
  const display = (v: number) =>
    mode === "Return"
      ? `${(((v - e.initialCashCents) / e.initialCashCents) * 100).toFixed(1)}%`
      : usd(Math.round(v));
  const values = marks.flatMap((m) => [m.equityCents, m.benchmarkCents]);
  const lo = Math.min(...values) * 0.995,
    hi = Math.max(...values) * 1.005,
    span = Math.max(100, hi - lo);
  const x = (i: number) => 18 + (i / Math.max(1, marks.length - 1)) * 822,
    y = (v: number) => 20 + ((hi - v) / span) * 232;
  const path = (key: "equityCents" | "benchmarkCents") =>
    marks
      .map(
        (m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m[key]).toFixed(1)}`,
      )
      .join(" ");
  return (
    <section
      className="arena-chart"
      aria-label="Portfolio value over simulated market days"
    >
      <div className="arena-chart-heading">
        <div>
          <span>{mode === "Return" ? "Total return" : "Portfolio value"}</span>
          <strong>{display(selected.equityCents)}</strong>
          <small>
            Simulated day {selected.day} ·{" "}
            {new Date(selected.recordedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        </div>
        <div className="arena-chart-tools">
          <div className="arena-chart-legend">
            <span>
              <i />
              ChatGPT
            </span>
            <span>
              <i />
              Equal-weight market
            </span>
          </div>
          <div
            className="arena-segmented"
            role="group"
            aria-label="Chart display"
          >
            {["Value", "Return"].map((v) => (
              <button
                key={v}
                aria-pressed={mode === v}
                onClick={() => setMode(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <svg
        viewBox="0 0 1000 286"
        role="img"
        aria-label={`Virtual NAV ${usd(marks.at(-1)!.equityCents)} on simulated day ${e.day}`}
      >
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="18"
              x2="840"
              y1={20 + (i * 232) / 3}
              y2={20 + (i * 232) / 3}
              className="arena-grid"
            />
            <text x="18" y={14 + (i * 232) / 3}>
              {display(hi - (i * span) / 3)}
            </text>
          </g>
        ))}
        <path d={path("benchmarkCents")} className="arena-benchmark-line" />
        <path d={path("equityCents")} className="arena-fund-line" />
        {marks.length === 1 && (
          <circle
            cx={x(0)}
            cy={y(marks[0].equityCents)}
            r="4"
            className="arena-fund-dot"
          />
        )}
        {Array.from({ length: Math.min(6, marks.length) }, (_, n) =>
          Math.round(
            (n * (marks.length - 1)) /
              Math.max(1, Math.min(6, marks.length) - 1),
          ),
        ).map((i) => (
          <text
            key={i}
            x={x(i)}
            y="280"
            textAnchor={
              i === 0 ? "start" : i === marks.length - 1 ? "end" : "middle"
            }
          >
            Day {marks[i].day}
          </text>
        ))}
        {(["equityCents", "benchmarkCents"] as const).map((key, i) => {
          const last = marks.at(-1)!;
          const ownY = y(last[key]),
            otherY = y(last[i === 0 ? "benchmarkCents" : "equityCents"]);
          const middle = Math.max(36, Math.min(224, (ownY + otherY) / 2));
          const labelY =
            Math.abs(ownY - otherY) < 30
              ? middle +
                (ownY < otherY || (ownY === otherY && i === 0) ? -16 : 16)
              : Math.max(20, Math.min(240, ownY));
          return (
            <g
              key={key}
              className={`arena-end-label ${i === 0 ? "fund" : "market"}`}
            >
              <line x1="840" y1={ownY} x2="868" y2={labelY} />
              <circle cx="840" cy={ownY} r="3.5" />
              <rect x="868" y={labelY - 12} width="126" height="24" rx="4" />
              <text x="931" y={labelY + 4} textAnchor="middle">
                {display(last[key])}
              </text>
            </g>
          );
        })}
        {point !== undefined && (
          <>
            <line
              x1={x(point)}
              x2={x(point)}
              y1="20"
              y2="252"
              className="arena-crosshair"
            />
            <circle
              cx={x(point)}
              cy={y(selected.equityCents)}
              r="4"
              className="arena-fund-dot"
            />
          </>
        )}
        <rect
          x="18"
          y="16"
          width="822"
          height="240"
          fill="transparent"
          onPointerMove={(ev) => {
            const box = ev.currentTarget.getBoundingClientRect();
            setPoint(
              Math.max(
                0,
                Math.min(
                  marks.length - 1,
                  Math.round(
                    ((ev.clientX - box.left) / box.width) * (marks.length - 1),
                  ),
                ),
              ),
            );
          }}
          onPointerLeave={() => setPoint(undefined)}
        />
      </svg>
      {marks.length > 1 && (
        <input
          className="arena-chart-scrubber"
          aria-label="Inspect simulated market day"
          type="range"
          min="0"
          max={marks.length - 1}
          value={point ?? marks.length - 1}
          onChange={(ev) => setPoint(Number(ev.target.value))}
        />
      )}
    </section>
  );
});
const LiveSession = memo(function LiveSession({
  runId,
  startedAt,
}: {
  runId: string;
  startedAt: string;
}) {
  const [activity, setActivity] = useState("Connecting to ChatGPT…");
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    let latest = "",
      timer: ReturnType<typeof setTimeout> | undefined;
    const stop = window.nomiDesktop?.onChatGPTDelta((e: ChatGPTDelta) => {
      if (e.requestId !== runId) return;
      if (e.item && e.item.kind !== "message") latest = e.item.title;
      if (e.activity) latest = "Search the web";
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          if (latest) setActivity(latest);
        }, 120);
    });
    const clock = setInterval(
      () =>
        setSeconds(
          Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)),
        ),
      1000,
    );
    return () => {
      stop?.();
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [runId, startedAt]);
  return (
    <div className="arena-live" role="status">
      <span className="arena-pulse" />
      <span>
        {activity}
        <small>Researching and deciding · {seconds}s</small>
      </span>
    </div>
  );
});
const AutoProgress = memo(function AutoProgress({
  automation: a,
  active,
}: {
  automation: ArenaAutomation;
  active: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!a.enabled) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [a.enabled]);
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(a.nextRunAt ?? "") - now) / 1000),
  );
  return (
    <div className="arena-auto-progress" role="status">
      <div>
        <strong>
          {a.enabled
            ? active
              ? "Decision in progress"
              : seconds > 0
                ? `Next decision in ${seconds}s`
                : "Starting next decision…"
            : a.completed >= a.maxRounds
              ? "Batch completed"
              : "Automatic decisions paused"}
        </strong>
        <span>
          {a.completed} / {a.maxRounds} rounds · {a.model}
          {a.reason ? ` · ${a.reason}` : ""}
        </span>
      </div>
      <progress
        aria-label="Automatic decision progress"
        value={a.completed}
        max={a.maxRounds}
      />
    </div>
  );
});
function Decision({
  decision: d,
  episode: e,
}: {
  decision: ArenaDecision;
  episode: ArenaEpisode;
}) {
  const fills = e.fills.filter((f) => f.runId === d.runId);
  const error = !["completed", "completed_with_warning"].includes(d.status);
  return (
    <article className="arena-decision" data-testid="arena-decision">
      <header>
        <span className="arena-agent-icon">✳</span>
        <div>
          <strong>ChatGPT</strong>
          <small>
            Day {d.day} ·{" "}
            {new Date(d.finishedAt || d.startedAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        </div>
        <span
          className={`arena-decision-status ${error ? "arena-negative" : ""}`}
        >
          {error ? d.status : d.action === "hold" ? "Hold" : "Rebalance"}
        </span>
      </header>
      <h3>
        {error
          ? "Session ended without a decision"
          : d.action === "hold"
            ? "Holding the current portfolio"
            : "Rebalancing the portfolio"}
      </h3>
      <ChatMarkdown
        text={
          d.thesis || d.summary || "No decision submitted; portfolio unchanged."
        }
      />
      {d.status === "completed_with_warning" && (
        <p className="arena-notice">
          The committed decision was settled. The model session ended early.
        </p>
      )}
      <div className="arena-fill-chips">
        {fills.map((f) => (
          <span
            key={f.id}
            className={f.side === "buy" ? "arena-buy" : "arena-sell"}
          >
            {f.side === "buy" ? "Buy" : "Sell"} {f.symbol}{" "}
            <b>{usd(f.grossCents)}</b>
          </span>
        ))}
        {!fills.length && !error && (
          <span>Cash and positions carried forward</span>
        )}
      </div>
      {(fills.length > 0 || d.evidence?.length > 0 || d.summary) && (
        <details>
          <summary>
            Decision details <ChevronRight size={14} />
          </summary>
          {d.summary && d.summary !== d.thesis && (
            <ChatMarkdown text={d.summary} />
          )}
          {fills.length > 0 && (
            <div className="arena-table-wrap">
              <table>
                <caption>Virtual fills at next-step simulated prices</caption>
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Side</th>
                    <th>Shares</th>
                    <th>Price</th>
                    <th>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {fills.map((f) => (
                    <tr key={f.id}>
                      <td>{f.symbol}</td>
                      <td>{f.side}</td>
                      <td>{(f.quantityMicros / 1e6).toFixed(6)}</td>
                      <td>{usd(f.priceCents)}</td>
                      <td>{usd(f.feeCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!d.evidence?.length && (
            <div className="arena-sources">
              {d.evidence.map((v, i) =>
                v.startsWith("https://") ? (
                  <button
                    key={i}
                    onClick={() =>
                      void requestChatGPT("openSource", { url: v })
                    }
                  >
                    Source {i + 1}
                    <ArrowUpRight size={12} />
                  </button>
                ) : (
                  <code key={i}>{v}</code>
                ),
              )}
            </div>
          )}
        </details>
      )}
    </article>
  );
}
export function Arena() {
  const connection = useChatGPT(),
    { openStock } = useWorkspace();
  const [view, setView] = useState<ArenaView>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("All"),
    [effort, setEffort] = useState<ChatGPTEffort>("low"),
    [interval, setIntervalSeconds] = useState("60"),
    [rounds, setRounds] = useState("20"),
    [controlsOpen, setControlsOpen] = useState(false),
    [mobileView, setMobileView] = useState("overview");
  const snapshot = useRef("");
  const apply = useCallback((v: ArenaView) => {
    const s = JSON.stringify(v);
    if (s !== snapshot.current) {
      snapshot.current = s;
      setView(v);
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      apply((await requestLocalData("arena.read")) as ArenaView);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apply]);
  useEffect(() => {
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  const episode = view?.episode,
    active = running(episode),
    auto = episode?.automation,
    automated = !!auto?.enabled,
    locked = busy || active || automated;
  const initializedAuto = useRef("");
  useEffect(() => {
    if (auto && initializedAuto.current !== auto.id) {
      initializedAuto.current = auto.id;
      setIntervalSeconds(String(auto.intervalSeconds));
      setRounds(String(auto.maxRounds));
    }
  }, [auto?.id]);
  useEffect(() => {
    if (!active && !busy && !automated) return;
    const t = setInterval(() => void refresh(), 1500);
    return () => clearInterval(t);
  }, [active, busy, automated, refresh]);
  const profile = connection.status?.profiles.find(
      (p) => p.id === connection.status?.activeProfileId,
    ),
    model = connection.models.find((m) => m.slug === connection.model);
  const selectedEffort = model?.reasoningEfforts?.includes(effort)
    ? effort
    : model?.defaultEffort;
  const act = async (kind: "create" | "advance" | "run") => {
    setBusy(true);
    setError("");
    try {
      if (kind === "run") {
        if (!profile || !episode)
          throw Error("Connect ChatGPT and create a simulation first.");
        const result = await runArena({
          episodeId: episode.id,
          profileId: profile.id,
          model: connection.model,
          effort: selectedEffort,
        });
        apply(result);
        if (result.episode?.run?.status === "failed")
          setError(
            result.episode.run.summary ||
              "Session finished without a submitted decision. Portfolio unchanged.",
          );
      } else
        apply(
          (await requestLocalData(
            kind === "create" ? "arena.create" : "arena.advance",
            kind === "advance" ? { episodeId: episode!.id } : undefined,
          )) as ArenaView,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const autoAction = async (pause = false) => {
    if (!episode || (!pause && !profile)) return;
    setBusy(true);
    setError("");
    try {
      apply(
        pause
          ? await pauseArenaAuto(episode.id)
          : await startArenaAuto({
              episodeId: episode.id,
              profileId: profile!.id,
              model: connection.model,
              effort: selectedEffort,
              intervalSeconds: Number(interval),
              maxRounds: Number(chosenRounds),
            }),
      );
      setControlsOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remaining = episode
    ? Math.max(0, Math.min(252 - episode.day, 500 - episode.decisions.length))
    : 0;
  const roundOptions = [
    ...new Set([
      5,
      20,
      50,
      remaining,
      ...(auto && auto.completed < auto.maxRounds ? [auto.maxRounds] : []),
    ]),
  ]
    .filter((v) => v > 0 && (v <= remaining || v === auto?.maxRounds))
    .sort((a, b) => a - b);
  const chosenRounds = roundOptions.includes(Number(rounds))
    ? rounds
    : String(Math.min(20, remaining));
  const equity = Number(view?.performance?.equityUSD ?? 10000) * 100,
    pnl = equity - (episode?.initialCashCents ?? 1e6),
    ret = view?.performance?.returnBps ?? 0;
  const positions =
    episode?.positions.filter((p) => p.quantityMicros > 0) ?? [];
  const decisions =
    episode?.decisions
      .slice()
      .reverse()
      .filter(
        (d) =>
          filter === "All" ||
          (filter === "Hold" && d.action === "hold") ||
          episode.fills.some(
            (f) => f.runId === d.runId && f.side === filter.toLowerCase(),
          ),
      ) ?? [];
  if (!view && !error)
    return (
      <div className="arena-loading">
        <DashboardSkeleton label="Loading Arena portfolio" />
      </div>
    );
  return (
    <div
      className="arena-workspace"
      data-testid="arena-workspace"
      data-mobile-view={mobileView}
    >
      <div className="arena-mobile-tabs" role="group" aria-label="Arena view">
        {["overview", "holdings"].map((v) => (
          <button
            key={v}
            aria-pressed={mobileView === v}
            onClick={() => setMobileView(v)}
          >
            {v === "overview" ? "Overview" : "Holdings"}
          </button>
        ))}
      </div>
      <aside className="arena-portfolio">
        <div className="arena-portfolio-title">
          <strong>Portfolios</strong>
          <span>Virtual USD</span>
        </div>
        <div className="arena-fund-heading">
          <span className="arena-agent-icon">✳</span>
          <strong>ChatGPT</strong>
          <span className={pnl < 0 ? "arena-negative" : "arena-positive"}>
            {pct(ret)}
          </span>
        </div>
        <div className="arena-holdings-head">
          <span>Stock</span>
          <span>Allocation</span>
          <span>P&L</span>
          <span>P&L %</span>
        </div>
        {positions.map((p) => {
          const a = episode!.assets.find((a) => a.symbol === p.symbol)!,
            value = Math.floor((p.quantityMicros * a.priceCents) / 1e6),
            gain = value - p.costCents,
            weight = (value / Math.max(1, equity)) * 100;
          return (
            <button
              className="arena-holding"
              key={p.symbol}
              onClick={() => openStock(p.symbol)}
            >
              <StockAvatar symbol={p.symbol} />
              <span>
                <b>{p.symbol}</b>
                <small>{(p.quantityMicros / 1e6).toFixed(4)} shares</small>
              </span>
              <span className="arena-weight">
                <i
                  style={{
                    background: `conic-gradient(var(--muted) ${weight * 3.6}deg, var(--border) 0)`,
                  }}
                  aria-hidden="true"
                />
                {weight.toFixed(1)}%
              </span>
              <span className={gain < 0 ? "arena-negative" : "arena-positive"}>
                {usd(gain)}
              </span>
              <span className={gain < 0 ? "arena-negative" : "arena-positive"}>
                {pct(Math.round((gain / Math.max(1, p.costCents)) * 10000))}
              </span>
            </button>
          );
        })}
        {!positions.length && (
          <div className="arena-no-holdings">
            <Wallet size={28} />
            <p>Ready to invest</p>
            <small>
              ChatGPT will research stocks and submit its first virtual
              allocation.
            </small>
          </div>
        )}
        <div className="arena-cash">
          <span>Available cash</span>
          <strong>{usd(episode?.cashCents ?? 1e6)}</strong>
        </div>
        <div className="arena-portfolio-total">
          <span>
            Total value<strong>{usd(equity)}</strong>
          </span>
          <span>
            Total P&L
            <strong className={pnl < 0 ? "arena-negative" : "arena-positive"}>
              {usd(pnl)}
            </strong>
          </span>
        </div>
        <details className="arena-market-list">
          <summary>
            Simulated market <span>Day {episode?.day ?? 0}</span>
            <ChevronDown size={13} />
          </summary>
          {episode?.assets.map((a) => (
            <div key={a.symbol}>
              <span>{a.symbol}</span>
              <span>{usd(a.priceCents)}</span>
              <small
                className={
                  a.changeBps < 0 ? "arena-negative" : "arena-positive"
                }
              >
                {pct(a.changeBps)}
              </small>
            </div>
          ))}
        </details>
      </aside>
      <main className="arena-main">
        <header className="arena-page-heading">
          <div>
            <div className="arena-heading-line">
              <Trophy size={24} />
              <h1>Arena</h1>
              <span className="arena-simulation-tag">Simulation</span>
            </div>
            <p>
              An AI-managed $10,000 portfolio. Follow every decision and watch
              the returns unfold.
            </p>
          </div>
          <div className="arena-heading-actions">
            {automated ? (
              <Button
                variant="primary"
                onClick={() => void autoAction(true)}
                disabled={busy}
              >
                <Pause size={13} />
                Pause automatic
              </Button>
            ) : active || busy ? (
              <Button
                onClick={() =>
                  void cancelArena().catch((e) => setError(e.message))
                }
              >
                <Square size={12} />
                Stop
              </Button>
            ) : !episode ? (
              <Button
                variant="primary"
                disabled={busy || !view}
                onClick={() => void act("create")}
              >
                <Plus size={14} />
                Create $10,000 portfolio
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={
                  locked ||
                  !profile?.sharing ||
                  !connection.model ||
                  episode.day >= 252
                }
                onClick={() => void act("run")}
              >
                <Play size={13} />
                {episode.decisions.length
                  ? "Run next session"
                  : "Start investing"}
              </Button>
            )}
            <button
              className="arena-refresh"
              aria-label="Arena settings"
              title="Arena settings"
              onClick={() => setControlsOpen(true)}
            >
              <SlidersHorizontal size={17} />
            </button>
            <button
              className="arena-refresh"
              aria-label="Refresh Arena"
              title="Refresh Arena"
              onClick={() => void refresh()}
              disabled={busy}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <Modal
          open={controlsOpen}
          onOpenChange={setControlsOpen}
          title="Arena settings"
          description="Choose how ChatGPT manages your simulated portfolio."
          className="arena-settings"
        >
          <div className="arena-controls">
            <Select
              label="Arena model"
              value={connection.model}
              options={connection.models.map((m) => ({
                value: m.slug,
                label: m.displayName,
              }))}
              onValueChange={connection.setModel}
              disabled={locked || !profile?.sharing}
              loading={connection.modelsLoading}
              placeholder="Connect ChatGPT"
            />
            {!!model?.reasoningEfforts?.length && (
              <Select
                label="Arena reasoning effort"
                value={selectedEffort ?? "low"}
                options={model.reasoningEfforts.map((v) => ({
                  value: v,
                  label: v[0].toUpperCase() + v.slice(1),
                }))}
                onValueChange={setEffort}
                disabled={locked}
              />
            )}
            {episode && (
              <Button
                variant="secondary"
                onClick={() => void act("advance")}
                disabled={locked || episode.day >= 252}
              >
                Advance market day
              </Button>
            )}
          </div>
          {episode && (
            <section
              className="arena-automation"
              aria-label="Continuous decisions"
            >
              <header>
                <Repeat2 size={18} />
                <div>
                  <h2>Continuous decisions</h2>
                  <p>
                    One round advances one simulated day. Interval starts after
                    each finished round.
                  </p>
                </div>
              </header>
              <div className="arena-auto-controls">
                <Select
                  label="Decision interval"
                  value={automated ? String(auto!.intervalSeconds) : interval}
                  options={[
                    { value: "30", label: "Every 30 seconds" },
                    { value: "60", label: "Every minute" },
                    { value: "300", label: "Every 5 minutes" },
                    { value: "900", label: "Every 15 minutes" },
                  ]}
                  onValueChange={setIntervalSeconds}
                  disabled={locked}
                />
                <Select
                  label="Automatic round limit"
                  value={automated ? String(auto!.maxRounds) : chosenRounds}
                  options={roundOptions.map((n) => ({
                    value: String(n),
                    label: `${n} rounds`,
                  }))}
                  onValueChange={setRounds}
                  disabled={locked}
                />
                {automated ? (
                  <Button
                    variant="primary"
                    onClick={() => void autoAction(true)}
                    disabled={busy}
                  >
                    <Pause size={14} /> Pause automatic
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => void autoAction()}
                    disabled={
                      locked ||
                      !profile?.sharing ||
                      !connection.model ||
                      remaining === 0
                    }
                  >
                    <Repeat2 size={15} />
                    {auto &&
                    auto.completed < auto.maxRounds &&
                    auto.model === connection.model &&
                    auto.intervalSeconds === Number(interval) &&
                    auto.maxRounds === Number(chosenRounds)
                      ? "Resume automatic"
                      : "Start automatic"}
                  </Button>
                )}
              </div>

              <small>
                Continues across pages while Nomi is running. Resumes saved
                rounds after restart; pauses on account changes or errors.
              </small>
            </section>
          )}
          {error && (
            <p role="alert" className="arena-error">
              {error}
            </p>
          )}
        </Modal>
        {!profile?.sharing && (
          <p className="arena-notice">
            <Info size={15} /> Connect ChatGPT in Settings to run an AI session.
            Simulation controls work without inference.
          </p>
        )}
        {error && (
          <div role="alert" className="arena-error">
            {error}
            <button onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        <section className="arena-metrics" aria-label="Portfolio performance">
          <div className="arena-entrant">
            <span>
              <span className="arena-agent-icon">✳</span>ChatGPT
            </span>
            <strong className={ret < 0 ? "arena-negative" : "arena-positive"}>
              {pct(ret)}
            </strong>
            <small>
              {auto?.enabled
                ? auto.model
                : connection.model || "Connected model"}
            </small>
          </div>
          <div>
            <span>
              <i className="arena-market-dot" />
              Equal-weight market
            </span>
            <strong>
              {pct(
                Math.round(
                  ((episode?.marks.at(-1)?.benchmarkCents ?? 1e6) /
                    (episode?.initialCashCents ?? 1e6) -
                    1) *
                    10000,
                ),
              )}
            </strong>
            <small>Simulated benchmark</small>
          </div>
          <div>
            <span>Portfolio value</span>
            <strong>{usd(equity)}</strong>
            <small className={pnl < 0 ? "arena-negative" : "arena-positive"}>
              {usd(pnl)} total P&L
            </small>
          </div>
          <div>
            <span>Available cash</span>
            <strong>{usd(episode?.cashCents ?? 1e6)}</strong>
            <small>
              {(
                ((episode?.cashCents ?? 1e6) / Math.max(1, equity)) *
                100
              ).toFixed(1)}
              % of portfolio
            </small>
          </div>
        </section>
        <div className="arena-runtime">
          {auto ? (
            <AutoProgress automation={auto} active={active} />
          ) : (
            <span className="arena-ready">
              <span className="arena-state-dot" />
              {active ? "Decision in progress" : "Manual decisions"}
            </span>
          )}
          {!automated && (
            <button
              className="arena-auto-entry"
              onClick={() => setControlsOpen(true)}
            >
              <Repeat2 size={13} />
              Automatic decisions
              <ChevronRight size={12} />
            </button>
          )}
        </div>
        {episode?.run && active && (
          <LiveSession
            runId={episode.run.id}
            startedAt={episode.run.startedAt}
          />
        )}
        {episode ? (
          <ArenaChart key={episode.id} episode={episode} />
        ) : (
          <div className="arena-chart-empty">
            <Trophy size={34} />
            <h2>Give your AI a starting balance</h2>
            <p>Create a portfolio, then let ChatGPT research and invest.</p>
          </div>
        )}
        <div className="arena-chart-footer">
          <span>
            Day {episode?.day ?? 0} <i>·</i> Max drawdown{" "}
            {((view?.performance?.maxDrawdownBps ?? 0) / 100).toFixed(2)}%
          </span>
          <span>
            {episode?.fills.length ?? 0} trades <i>·</i> $
            {view?.performance?.feesUSD ?? "0.00"} fees
          </span>
        </div>
        <p className="arena-market-note">
          <Info size={14} /> Fictional prices and virtual funds. A session
          settles at the next simulated day. Market benchmark excludes costs.
        </p>
        <section className="arena-feed">
          <div className="arena-feed-heading">
            <h2>Decision feed</h2>
            <div role="group" aria-label="Filter decisions">
              {["All", "Buy", "Sell", "Hold"].map((v) => (
                <button
                  key={v}
                  aria-pressed={filter === v}
                  onClick={() => setFilter(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {decisions.map((d) => (
            <Decision key={d.runId} decision={d} episode={episode!} />
          ))}
          {!decisions.length && (
            <div className="arena-feed-empty">
              {episode?.decisions.length
                ? "No decisions match this filter."
                : "Research, allocation changes and hold decisions will appear here."}
            </div>
          )}
        </section>
        {episode && (
          <details className="arena-rules">
            <summary>Simulation rules & ledger</summary>
            <p>
              Long-only stocks and cash · 252 simulated days · six-decimal
              shares · 0.10% adverse spread · 0.02% fee (minimum $0.01) · $1
              minimum trade · 0.25% allocation reserve. Research can describe
              real companies, but synthetic outcomes do not track their
              fundamentals. This is a workflow demonstration, not a historical
              backtest.
            </p>
            <p>
              Account {episode.id.slice(0, 8)} · {episode.decisions.length}{" "}
              sessions · {episode.marks.length} NAV marks · saved locally in
              SQLite.
            </p>
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => void act("create")}
            >
              New simulation
            </Button>
            <small>
              Creates another $10,000 account; the previous ledger remains
              stored.
            </small>
          </details>
        )}
      </main>
    </div>
  );
}
