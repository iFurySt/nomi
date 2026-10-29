import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type {
  ArenaMethod,
  ArenaRunRequest,
  ArenaAutoRequest,
  ChatGPTStatus,
  ArenaView,
  ChatGPTDelta,
  ChatGPTRequest,
} from "../../core/src/index";
import { chatGPTEfforts, validChatGPTId } from "../../core/src/index";
import type { DataHost } from "./runtime";
import type { ChatGPTHost } from "./chatgpt";
import type { AgentRuntime } from "./codex-runtime";
import { CodexRuntime } from "./codex-runtime";

/** Coordinates one bounded Codex turn; the Go ledger is the only execution authority. */
export class ArenaHost {
  private active?: {
    requestId: string;
    cancelled: boolean;
    controller: AbortController;
    generation?: string;
    episodeId: string;
    shutdown?: boolean;
  };
  private operation?: Promise<unknown>;
  private stopping = false;
  private timer?: ReturnType<typeof setTimeout>;
  private autoEpisode?: string;
  private ticking = false;
  private scheduleEpoch = 0;
  constructor(
    private data: Pick<DataHost, "request" | "arenaControl">,
    private chat: Pick<
      ChatGPTHost,
      "respondWithAgent" | "request" | "inferenceBusy"
    >,
    private makeAgent: (episode: string, run: string) => AgentRuntime,
    private emitAuto: (e: ChatGPTDelta) => void = () => {},
  ) {}
  async recover() {
    await this.data.arenaControl("arena.recover");
    const view = (await this.data.request("arena.read")) as ArenaView;
    if (view.episode?.automation?.enabled) {
      this.scheduleEpoch++;
      this.autoEpisode = view.episode.id;
      this.arm(1000);
    }
  }
  private arm(delay: number) {
    clearTimeout(this.timer);
    if (this.stopping || !this.autoEpisode) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.tick();
      },
      Math.max(50, Math.min(delay, 86400000)),
    );
    this.timer.unref?.();
  }
  private async pauseAuto(episodeId: string, reason: string) {
    if (this.autoEpisode === episodeId) {
      this.scheduleEpoch++;
      clearTimeout(this.timer);
      this.autoEpisode = undefined;
    }
    const view = (await this.data.arenaControl("arena.auto.pause", {
      episodeId,
      summary: reason,
    })) as ArenaView;
    if (this.active?.generation && this.active.episodeId === episodeId)
      await this.cancelActive();
    return view;
  }
  private async cancelActive() {
    if (!this.active) return;
    this.active.cancelled = true;
    this.active.controller.abort();
    await this.chat.request("cancelResponse", {
      requestId: this.active.requestId,
    });
  }
  private async tick() {
    if (this.stopping || !this.autoEpisode) return;
    if (this.ticking || this.active) {
      this.arm(1000);
      return;
    }
    this.ticking = true;
    const episodeId = this.autoEpisode,
      epoch = this.scheduleEpoch;
    let delay = 15000;
    try {
      const view = (await this.data.request("arena.read")) as ArenaView,
        e = view.episode,
        a = e?.automation;
      if (epoch !== this.scheduleEpoch) return;
      if (!e || e.id !== episodeId || !a?.enabled) {
        this.autoEpisode = undefined;
        return;
      }
      const due = Date.parse(a.nextRunAt ?? "");
      if (!Number.isFinite(due)) throw Error("Invalid next decision time");
      if (due > Date.now()) {
        delay = due - Date.now();
        return;
      }
      const status = (await this.chat.request("status")) as ChatGPTStatus;
      if (epoch !== this.scheduleEpoch) return;
      if (
        status.activeProfileId !== a.profileId ||
        !status.profiles.some((p) => p.id === a.profileId && p.sharing)
      ) {
        await this.pauseAuto(
          e.id,
          "ChatGPT account changed or authorization is unavailable",
        );
        return;
      }
      if (this.chat.inferenceBusy) {
        await this.data.arenaControl("arena.auto.defer", {
          episodeId: e.id,
          automationId: a.id,
          summary: "Waiting for the current ChatGPT request",
        });
        return;
      }
      const result = await this.execute(
        {
          episodeId: e.id,
          profileId: a.profileId,
          model: a.model,
          effort: a.effort || undefined,
        },
        this.emitAuto,
        a.id,
      );
      if (epoch !== this.scheduleEpoch) return;
      const next = result.episode?.automation;
      if (!next?.enabled) {
        this.autoEpisode = undefined;
        return;
      }
      delay = Math.max(50, Date.parse(next.nextRunAt!) - Date.now());
    } catch {
      // Never retry inference blindly. Accepted intents remain recoverable in Go.
      if (epoch !== this.scheduleEpoch) return;
      try {
        await this.pauseAuto(
          episodeId,
          "Automatic decisions paused after an error. Review the latest session and retry.",
        );
      } catch {
        this.autoEpisode = undefined;
      }
    } finally {
      this.ticking = false;
      if (this.autoEpisode && epoch === this.scheduleEpoch) this.arm(delay);
    }
  }
  async request(
    method: ArenaMethod,
    params: unknown,
    emit: (e: ChatGPTDelta) => void = () => {},
  ): Promise<unknown> {
    if (this.stopping) throw Error("Arena is stopping.");
    if (method === "auto.pause") {
      const p = params as { episodeId?: string };
      if (
        !p ||
        Object.keys(p).length !== 1 ||
        !/^[a-f0-9]{32}$/.test(p.episodeId ?? "")
      )
        throw Error("Invalid automation pause");
      return this.pauseAuto(p.episodeId!, "Paused by you");
    }
    if (method === "auto.start") {
      const p = params as ArenaAutoRequest;
      if (
        !p ||
        Object.keys(p).some(
          (k) =>
            ![
              "episodeId",
              "profileId",
              "model",
              "effort",
              "intervalSeconds",
              "maxRounds",
            ].includes(k),
        ) ||
        !Number.isInteger(p.intervalSeconds) ||
        p.intervalSeconds < 30 ||
        p.intervalSeconds > 86400 ||
        !Number.isInteger(p.maxRounds) ||
        p.maxRounds < 1 ||
        p.maxRounds > 252
      )
        throw Error("Invalid automation settings");
      this.validateRun({
        episodeId: p.episodeId,
        profileId: p.profileId,
        model: p.model,
        ...(p.effort !== undefined ? { effort: p.effort } : {}),
      });
      const status = (await this.chat.request("status")) as ChatGPTStatus;
      if (
        status.activeProfileId !== p.profileId ||
        !status.profiles.some((v) => v.id === p.profileId && v.sharing)
      )
        throw Error("Connect the selected ChatGPT account first.");
      const view = (await this.data.arenaControl("arena.auto.start", {
        ...p,
        effort: p.effort ?? "",
      })) as ArenaView;
      this.scheduleEpoch++;
      this.autoEpisode = p.episodeId;
      this.arm(50);
      return view;
    }
    if (method === "cancel") {
      if (params !== undefined) throw Error("Invalid cancel request.");
      if (this.autoEpisode)
        return this.pauseAuto(this.autoEpisode, "Paused by you");
      await this.cancelActive();
      return;
    }
    if (method !== "run") throw Error("Unsupported arena action.");
    this.validateRun(params);
    return this.execute(params, emit);
  }
  private validateRun(params: unknown): asserts params is ArenaRunRequest {
    const p = params as ArenaRunRequest;
    if (
      !p ||
      typeof p !== "object" ||
      Object.keys(p).some(
        (k) => !["episodeId", "profileId", "model", "effort"].includes(k),
      ) ||
      !/^[a-f0-9]{32}$/.test(p.episodeId) ||
      !validChatGPTId(p.profileId) ||
      typeof p.model !== "string" ||
      !p.model ||
      p.model.length > 160 ||
      (p.effort !== undefined && !chatGPTEfforts.includes(p.effort))
    )
      throw Error("Invalid Arena session.");
  }
  private async execute(
    p: ArenaRunRequest,
    emit: (e: ChatGPTDelta) => void,
    generation?: string,
  ): Promise<ArenaView> {
    if (this.active) throw Error("An Arena session is already running.");
    if (this.stopping) throw Error("Arena is stopping.");
    const requestId = randomBytes(16).toString("hex"),
      active = {
        requestId,
        cancelled: false,
        generation,
        episodeId: p.episodeId,
        controller: new AbortController(),
      };
    this.active = active;
    const operation = this.run(p, active, emit);
    this.operation = operation;
    try {
      return await operation;
    } finally {
      this.active = undefined;
      this.operation = undefined;
    }
  }
  private async run(
    p: ArenaRunRequest,
    active: {
      requestId: string;
      cancelled: boolean;
      controller: AbortController;
      generation?: string;
      shutdown?: boolean;
    },
    emit: (e: ChatGPTDelta) => void,
  ) {
    let begun = false,
      agent: AgentRuntime | undefined,
      status = "failed",
      summary = "";
    try {
      await this.data.arenaControl("arena.run.begin", {
        episodeId: p.episodeId,
        runId: active.requestId,
        model: p.model,
        effort: p.effort ?? (active.generation ? "" : "default"),
        ...(active.generation ? { automationId: active.generation } : {}),
      });
      begun = true;
      if (active.cancelled) throw Error("Session cancelled before inference.");
      agent = this.makeAgent(p.episodeId, active.requestId);
      const request: ChatGPTRequest = {
        requestId: active.requestId,
        conversationId: active.requestId,
        profileId: p.profileId,
        model: p.model,
        effort: p.effort,
        messages: [
          {
            role: "user",
            content:
              "Run one investment session for this $10,000 virtual stock account. The mandate is diversified long-term equity participation with a default 80% stock / 20% cash allocation, at least four stocks across sectors and normally no more than 25% in one stock. Choose actual weights yourself; deviations and holds need a public explanation. Lack of a predictive edge in fictional prices is expected and by itself is not a reason to abandon the equity mandate. Use company research for diversification context, never to forecast the random synthetic market. Read your portfolio, inspect available local company research, review prior results and choose a sensible allocation or hold. Use the bound arena tools to submit exactly one decision; plain text alone does not commit a decision. You may invest in the provided stock universe only. All market quotes and outcomes are synthetic. Keep the public thesis concise and state the main risk.",
          },
        ],
      };
      const reply = await this.chat.respondWithAgent(
        request,
        agent,
        (e) => {
          emit(e);
          if (e.prompt) {
            void this.chat
              .request("answerPrompt", {
                requestId: active.requestId,
                promptId: e.prompt.id,
                decision: "decline",
              })
              .catch(() => {});
          }
        },
        active.controller.signal,
      );
      status = "succeeded";
      summary = reply.text;
    } catch (error) {
      status = active.shutdown
        ? "interrupted"
        : active.cancelled
          ? "cancelled"
          : "failed";
      summary = error instanceof Error ? error.message : "Session failed.";
      if (
        active.generation &&
        !active.cancelled &&
        /^Finish or cancel the current ChatGPT request/.test(summary)
      )
        status = "deferred";
    } finally {
      agent?.close();
    }
    if (!begun) throw Error(summary || "Session could not start.");
    return (await this.data.arenaControl("arena.run.finish", {
      episodeId: p.episodeId,
      runId: active.requestId,
      status,
      summary,
    })) as ArenaView;
  }
  async dispose() {
    this.stopping = true;
    clearTimeout(this.timer);
    if (this.active) {
      this.active.shutdown = true;
      this.active.cancelled = true;
      this.active.controller.abort();
      await this.chat.request("cancelResponse", {
        requestId: this.active.requestId,
      });
    }
    await this.operation?.catch(() => {});
  }
}
export function arenaAgentFactory(
  codexBinary: string,
  dataBinary: string,
  dataDir: string,
) {
  return (episodeId: string, runId: string) =>
    new CodexRuntime(
      codexBinary,
      join(dataDir, "arena-agent", episodeId, runId),
      undefined,
      undefined,
      { binary: dataBinary, dataDir, arena: { episodeId, runId } },
    );
}
