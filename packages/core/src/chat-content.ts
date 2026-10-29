import { validAgentItems, type AgentChatItem } from "./agent-chat";
/** Provider-visible activity only; never hidden reasoning or executable input. */
export interface ChatToolStep {
  id: string;
  type: "search" | "open_page" | "find_in_page";
  status: "in_progress" | "completed";
  query?: string;
}
export interface ChatCitation {
  start: number;
  end: number;
  url: string;
  title: string;
}
export interface ChatSource {
  url: string;
  title: string;
}
export interface ChatReplyDetails {
  tools: ChatToolStep[];
  citations: ChatCitation[];
  durationMs: number;
  sources?: ChatSource[];
  items?: AgentChatItem[];
}
export function safeChatSourceURL(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\u0000-\u0020\u007f]/.test(value)
  )
    return;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !/^[a-z0-9.-]+$/i.test(u.hostname) ||
      !u.hostname.includes(".") ||
      u.hostname.endsWith(".") ||
      /^[\d.]+$/.test(u.hostname) ||
      /(?:^|\.)(?:localhost|local|localdomain|internal|lan|home|corp|test|invalid)$/.test(
        u.hostname,
      )
    )
      return;
    return u.href;
  } catch {
    return;
  }
}
export function validChatReplyDetails(v: unknown): v is ChatReplyDetails {
  if (!v || typeof v !== "object") return false;
  const d = v as ChatReplyDetails;
  return (
    Object.keys(d).every((k) =>
      ["tools", "citations", "durationMs", "sources", "items"].includes(k),
    ) &&
    (d.items === undefined || validAgentItems(d.items)) &&
    Number.isFinite(d.durationMs) &&
    d.durationMs >= 0 &&
    d.durationMs <= 600000 &&
    Array.isArray(d.tools) &&
    d.tools.length <= 24 &&
    d.tools.every(
      (s) =>
        s &&
        Object.keys(s).every((k) =>
          ["id", "type", "status", "query"].includes(k),
        ) &&
        typeof s.id === "string" &&
        /^[\w-]{1,160}$/.test(s.id) &&
        ["search", "open_page", "find_in_page"].includes(s.type) &&
        ["in_progress", "completed"].includes(s.status) &&
        (s.query === undefined ||
          (typeof s.query === "string" && s.query.length <= 300)),
    ) &&
    Array.isArray(d.citations) &&
    d.citations.length <= 80 &&
    (d.sources === undefined ||
      (Array.isArray(d.sources) &&
        d.sources.length <= 20 &&
        d.sources.every(
          (s) =>
            s &&
            Object.keys(s).every((k) => ["url", "title"].includes(k)) &&
            !!safeChatSourceURL(s.url) &&
            typeof s.title === "string" &&
            s.title.length <= 200,
        ))) &&
    d.citations.every(
      (c) =>
        c &&
        Object.keys(c).every((k) =>
          ["start", "end", "url", "title"].includes(k),
        ) &&
        Number.isSafeInteger(c.start) &&
        Number.isSafeInteger(c.end) &&
        c.start >= 0 &&
        c.end >= c.start &&
        c.end <= 32000 &&
        !!safeChatSourceURL(c.url) &&
        typeof c.title === "string" &&
        c.title.length <= 200,
    )
  );
}

/** Keep source text; replace citation markers only, otherwise append a reference. */
export function citedMarkdown(text: string, citations: ChatCitation[]): string {
  const valid = citations.filter(
    (c) =>
      safeChatSourceURL(c.url) &&
      Number.isSafeInteger(c.start) &&
      Number.isSafeInteger(c.end) &&
      c.start >= 0 &&
      c.end >= c.start &&
      c.end <= text.length,
  );
  const sources = [...new Set(valid.map((c) => c.url))];
  const groups: { start: number; end: number; urls: string[] }[] = [];
  for (const c of [...valid].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )) {
    const last = groups.at(-1);
    if (
      last &&
      (c.start < last.end || (c.start === last.start && c.end === last.end))
    ) {
      last.end = Math.max(last.end, c.end);
      if (!last.urls.includes(c.url)) last.urls.push(c.url);
    } else groups.push({ start: c.start, end: c.end, urls: [c.url] });
  }
  let cursor = 0,
    result = "";
  const clean = (s: string) => s.replace(/cite[^]*(?:|$)/g, "");
  for (const g of groups) {
    result +=
      clean(text.slice(cursor, g.start)) + clean(text.slice(g.start, g.end));
    const original = text.slice(g.start, g.end);
    result += g.urls
      .filter(
        (url) =>
          !original.includes(`](${url})`) && !original.includes(`](<${url}>)`),
      )
      .map(
        (url) => ` [${sources.indexOf(url) + 1}](<${safeChatSourceURL(url)}>)`,
      )
      .join("");
    cursor = g.end;
  }
  return result + clean(text.slice(cursor));
}
