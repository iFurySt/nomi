import {
  safeChatSourceURL,
  type ChatToolStep,
  type ChatCitation,
  type ChatReplyDetails,
  type ChatSource,
} from "../../core/src/chat-content";
/** Reduces bounded SSE data to display metadata. No reasoning/arguments cross IPC. */
export class ChatGPTContent {
  private steps = new Map<string, ChatToolStep>();
  private sources = new Map<string, ChatSource>();
  private messages = new Map<string, { content: unknown[] }>();
  constructor(private emit: (step: ChatToolStep) => void) {}
  event(value: unknown) {
    if (!value || typeof value !== "object") return;
    const e = value as Record<string, any>;
    if (typeof e.type !== "string") return;
    if (e.type.startsWith("response.web_search_call."))
      this.step({
        id: e.item_id,
        status: e.type.endsWith("completed") ? "completed" : "in_progress",
      });
    if (
      ["response.output_item.added", "response.output_item.done"].includes(
        e.type,
      ) &&
      e.item?.type === "web_search_call"
    )
      this.step(e.item);
    if (e.type === "response.output_item.done" && e.item?.type === "message")
      this.message(e.item, e.output_index);
    if (e.type === "response.completed" && Array.isArray(e.response?.output))
      for (const [i, item] of e.response.output.entries()) {
        if (item?.type === "web_search_call") this.step(item);
        if (item?.type === "message") this.message(item, i);
      }
  }
  private message(item: Record<string, any>, index: unknown) {
    if (!Array.isArray(item.content) || this.messages.size >= 100) return;
    const key = typeof item.id === "string" ? item.id : String(index);
    // Retain display text/annotations only, no opaque reasoning or provider context.
    this.messages.set(key, {
      content: item.content
        .filter((p) => p?.type === "output_text")
        .map((p) => ({ text: p.text, annotations: p.annotations })),
    });
  }
  private step(item: Record<string, any>) {
    if (
      typeof item?.id !== "string" ||
      !/^[\w-]{1,160}$/.test(item.id) ||
      (!this.steps.has(item.id) && this.steps.size >= 24)
    )
      return;
    const old = this.steps.get(item.id),
      action = item.action;
    for (const source of Array.isArray(action?.sources) ? action.sources : []) {
      const url = safeChatSourceURL(source?.url);
      if (url && this.sources.size < 20)
        this.sources.set(url, {
          url,
          title:
            typeof source.title === "string"
              ? source.title.slice(0, 200)
              : new URL(url).hostname,
        });
    }
    const query =
      typeof action?.query === "string"
        ? action.query
        : Array.isArray(action?.queries)
          ? action.queries
              .filter((q: unknown) => typeof q === "string")
              .join(" · ")
          : undefined;
    const step: ChatToolStep = {
      id: item.id,
      type: ["search", "open_page", "find_in_page"].includes(action?.type)
        ? action.type
        : (old?.type ?? "search"),
      status:
        item.status === "completed" || old?.status === "completed"
          ? "completed"
          : "in_progress",
      ...(query
        ? { query: query.slice(0, 300) }
        : old?.query
          ? { query: old.query }
          : {}),
    };
    if (JSON.stringify(step) !== JSON.stringify(old)) {
      this.steps.set(step.id, step);
      this.emit(step);
    }
  }
  finish(text: string, durationMs: number): ChatReplyDetails {
    const citations: ChatCitation[] = [];
    let offset = 0;
    for (const item of this.messages.values())
      for (const value of item.content) {
        const part = value as { text?: unknown; annotations?: unknown };
        if (typeof part.text !== "string") continue;
        const points = Array.from(part.text);
        for (const value of Array.isArray(part.annotations)
          ? part.annotations
          : []) {
          const a = value as Record<string, any>;
          const url = safeChatSourceURL(a?.url);
          if (
            a?.type !== "url_citation" ||
            !url ||
            citations.length >= 80 ||
            !Number.isSafeInteger(a.start_index) ||
            !Number.isSafeInteger(a.end_index) ||
            a.start_index < 0 ||
            a.end_index < a.start_index ||
            a.end_index > part.text.length
          )
            continue;
          let start = a.start_index,
            end = a.end_index;
          if (
            !part.text.slice(start, end).startsWith("") &&
            points.slice(start, end).join("").startsWith("")
          ) {
            start = points.slice(0, start).join("").length;
            end = points.slice(0, end).join("").length;
          }
          if (offset + end <= text.length)
            citations.push({
              start: offset + start,
              end: offset + end,
              url,
              title:
                typeof a.title === "string"
                  ? a.title.slice(0, 200)
                  : new URL(url).hostname,
            });
        }
        offset += part.text.length;
      }
    const details: ChatReplyDetails = {
      tools: [...this.steps.values()],
      citations: citations.sort((a, b) => a.start - b.start),
      durationMs: Math.min(600000, Math.max(0, durationMs)),
      ...(this.sources.size ? { sources: [...this.sources.values()] } : {}),
    };
    // Keep persisted display metadata small even when upstream sends long URLs.
    while (JSON.stringify(details).length > 24000) {
      if (details.sources?.length) details.sources.pop();
      else if (details.citations.length) details.citations.pop();
      else break;
    }
    return details;
  }
}
