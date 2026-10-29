import { safeChatSourceURL } from "../../core/src/chat-content";
import type { ChatSource } from "../../core/src/chat-content";
import type { AgentChatItem, ChatGPTDelta } from "../../core/src/index";
const text = (v: unknown, n = 32000) =>
  typeof v === "string" ? v.slice(0, n) : "";
const id = (v: unknown) =>
  typeof v === "string" && /^[\w:.-]{1,160}$/.test(v) ? v : undefined;
/** Normalize presentation only. Raw reasoning, tool arguments and arbitrary HTML never cross IPC. */
export class CodexEvents {
  items = new Map<string, AgentChatItem>();
  sources = new Map<string, ChatSource>();
  constructor(
    private requestId: string,
    private emit: (e: ChatGPTDelta) => void,
    private clean: (s: string) => string = (s) => s,
  ) {}
  put(item: AgentChatItem) {
    if (!this.items.has(item.id) && this.items.size >= 80) return;
    const old = this.items.get(item.id);
    if (item.kind === "message") {
      let total = [...this.items.values()].reduce(
        (n, i) => n + (i.id === item.id ? 0 : (i.text?.length ?? 0)),
        0,
      );
      const reserve = Math.min(32000, item.text?.length ?? 0);
      for (const previous of this.items.values()) {
        if (
          previous.id === item.id ||
          !previous.text ||
          total + reserve <= 64000
        )
          continue;
        const keep = Math.max(
          0,
          previous.text.length - (total + reserve - 64000),
        );
        total -= previous.text.length - keep;
        const shortened = { ...previous, text: previous.text.slice(0, keep) };
        this.items.set(previous.id, shortened);
        this.emit({ requestId: this.requestId, text: "", item: shortened });
      }
    }
    const others = [...this.items.values()].reduce(
      (n, i) => n + (i.id === item.id ? 0 : (i.text?.length ?? 0)),
      0,
    );
    const next = {
      ...item,
      text: this.clean(item.text ?? "").slice(0, Math.max(0, 64000 - others)),
    };
    if (old && old.status !== "running" && next.status === "running")
      next.status = old.status;
    while (
      JSON.stringify(
        [...this.items.values()].filter((i) => i.id !== item.id).concat(next),
      ).length > 90000 &&
      next.text.length
    )
      next.text = next.text.slice(0, Math.floor(next.text.length * 0.8));
    if (old && JSON.stringify(old) === JSON.stringify(next)) return;
    this.items.set(item.id, next);
    this.emit({ requestId: this.requestId, text: "", item: next });
  }
  event(method: string, p: any) {
    if (method === "item/agentMessage/delta") {
      const key = id(p.itemId);
      if (!key) return;
      const old = this.items.get(key);
      this.put({
        id: key,
        kind: "message",
        status: "running",
        title: old?.title ?? "Nomi",
        ...(old?.phase ? { phase: old.phase } : {}),
        text: text((old?.text ?? "") + text(p.delta)),
      });
      return;
    }
    if (method === "item/plan/delta") {
      const key = id(p.itemId);
      if (!key) return;
      this.put({
        id: key,
        kind: "plan",
        title: "Plan",
        status: "running",
        text: text((this.items.get(key)?.text ?? "") + text(p.delta)),
      });
      return;
    }
    if (method === "item/commandExecution/outputDelta") {
      const old = this.items.get(p.itemId);
      if (old)
        this.put({
          ...old,
          text: text((old.text ?? "") + text(p.delta, 8000), 8000),
        });
      return;
    }
    if (method === "turn/plan/updated") {
      this.put({
        id: "turn-plan",
        kind: "plan",
        status: "running",
        title: "Plan",
        text: (Array.isArray(p.plan) ? p.plan.slice(0, 20) : [])
          .map((s: any) => `${text(s.status, 30)} · ${text(s.step, 500)}`)
          .join("\n"),
      });
      return;
    }
    if (
      method === "model/rerouted" ||
      method === "deprecationNotice" ||
      method === "warning"
    ) {
      this.put({
        id: "runtime-notice",
        kind: "notice",
        status: "completed",
        title: method === "model/rerouted" ? "Model changed" : "Runtime notice",
        text:
          method === "model/rerouted"
            ? text(p.toModel, 160)
            : "The runtime reported a compatibility notice.",
      });
      return;
    }
    if (method !== "item/started" && method !== "item/completed") return;
    const i = p.item;
    const key = id(i?.id);
    if (!key) return;
    if (["userMessage", "reasoning", "hookPrompt"].includes(i.type)) return;
    if (i.type === "webSearch") {
      const collect = (v: any, depth = 0) => {
        if (!v || typeof v !== "object" || depth > 5 || this.sources.size >= 20)
          return;
        const url = safeChatSourceURL(v.url);
        if (url) this.sources.set(url, { url, title: text(v.title, 200) });
        for (const child of Object.values(v).slice(0, 50))
          collect(child, depth + 1);
      };
      collect(i.results);
    }
    if (i.type === "mcpToolCall" && i.server === "nomi") {
      const evidence = i.result?.structuredContent?.evidence;
      for (const ref of Array.isArray(evidence) ? evidence.slice(0, 20) : []) {
        const url = safeChatSourceURL(ref.url);
        if (url && this.sources.size < 20)
          this.sources.set(url, {
            url,
            title: text(ref.provider, 100) || "Research source",
          });
      }
    }
    const status = ["failed", "declined"].includes(i.status)
      ? i.status
      : method === "item/completed"
        ? "completed"
        : "running";
    const phase = ["commentary", "final_answer"].includes(i.phase)
      ? i.phase
      : this.items.get(key)?.phase;
    let kind: AgentChatItem["kind"] = "notice",
      title = "Activity",
      body = "";
    switch (i.type) {
      case "agentMessage":
        kind = "message";
        title = phase === "commentary" ? "Progress" : "Nomi";
        body = text(i.text);
        break;
      case "plan":
        kind = "plan";
        title = "Plan";
        body = text(i.text);
        break;
      case "webSearch":
        kind = "search";
        title = "Search the web";
        body = text(i.query || i.action?.query, 300);
        break;
      case "commandExecution":
        kind = "command";
        title = "Run command";
        body =
          text(i.command, 2000) +
          (i.aggregatedOutput ? "\n\n" + text(i.aggregatedOutput, 6000) : "") +
          (i.exitCode != null ? `\nExit code: ${i.exitCode}` : "");
        break;
      case "fileChange":
        kind = "file";
        title = "File changes";
        body = (Array.isArray(i.changes) ? i.changes.slice(0, 20) : [])
          .map((c: any) => text(c.path, 500) + "\n" + text(c.diff, 1000))
          .join("\n");
        break;
      case "mcpToolCall":
      case "dynamicToolCall":
        kind = "tool";
        title =
          i.namespace === "nomi" && i.tool === "web_search"
            ? "Search the web"
            : i.namespace === "nomi" && i.tool === "search_stocks"
              ? "Search local stocks"
              : (i.server === "nomi"
                  ? (
                      {
                        describe_data: "Check data coverage",
                        arena_get_portfolio_state: "Review virtual portfolio",
                        arena_preview_rebalance: "Preview allocation",
                        arena_submit_decision: "Commit virtual decision",
                        arena_list_orders: "Review virtual fills",
                        arena_get_performance: "Review simulation performance",
                        search_instruments: "Search instruments",
                        get_company_overview: "Read company overview",
                        query_financials: "Read financials",
                        query_prices: "Read price history",
                        query_disclosures: "Read disclosures",
                        query_ownership: "Read ownership",
                        read_evidence: "Read source evidence",
                      } as Record<string, string>
                    )[i.tool]
                  : undefined) ||
                text(i.tool, 160) ||
                "Tool";
        body = i.error
          ? "Tool failed"
          : i.success === false
            ? "Tool failed"
            : "";
        break;
      case "functionCallOutput":
        // Code-mode tools also report completed outputs as items. Display only
        // textual output; images, arguments and provider objects stay in Node.
        kind = "tool";
        title = text(i.name, 160) || "Tool output";
        body =
          typeof i.output === "string"
            ? text(i.output, 8000)
            : (Array.isArray(i.output) ? i.output.slice(0, 20) : [])
                .filter((c: any) => c.type === "input_text")
                .map((c: any) => text(c.text, 1000))
                .join("\n");
        break;
      case "collabAgentToolCall":
      case "subAgentActivity":
        kind = "agent";
        title = "Agent activity";
        body = text(i.tool || i.kind, 200);
        break;
      case "contextCompaction":
        kind = "compaction";
        title = "Compacting context";
        break;
      case "enteredReviewMode":
      case "exitedReviewMode":
        title = "Review";
        body = text(i.review);
        break;
      default:
        title = "Additional activity";
        body = "This activity is not displayed by this version of Nomi.";
    }
    this.put({
      id: key,
      kind,
      status:
        i.success === false ||
        i.error ||
        (i.type === "commandExecution" &&
          typeof i.exitCode === "number" &&
          i.exitCode !== 0)
          ? "failed"
          : status,
      title,
      text: body,
      ...(kind === "message" && phase ? { phase } : {}),
    });
  }
  finish(failed: boolean | "interrupted" = false) {
    for (const i of this.items.values())
      if (i.status === "running")
        this.put({
          ...i,
          status:
            failed === "interrupted"
              ? "interrupted"
              : failed
                ? "failed"
                : "completed",
        });
    return [...this.items.values()];
  }
  get reply() {
    const messages = [...this.items.values()].filter(
      (i) => i.kind === "message",
    );
    const final = messages.filter((i) => i.phase === "final_answer");
    return (
      final.length
        ? final
        : messages.filter((i) => i.phase !== "commentary").slice(-1)
    )
      .map((i) => i.text)
      .join("\n\n")
      .slice(0, 32000);
  }
}
