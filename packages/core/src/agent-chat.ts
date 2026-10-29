/** Bounded presentation protocol. Raw app-server RPC and credentials stay in Node. */
export const agentKinds = [
  "message",
  "plan",
  "search",
  "tool",
  "command",
  "file",
  "compaction",
  "agent",
  "notice",
] as const;
export interface AgentChatItem {
  id: string;
  kind: (typeof agentKinds)[number];
  status: "running" | "completed" | "failed" | "declined" | "interrupted";
  title: string;
  text?: string;
  phase?: "commentary" | "final_answer";
}
export interface AgentQuestion {
  id: string;
  question: string;
  options?: string[];
}
export interface AgentChatPrompt {
  id: string;
  kind: "command" | "file" | "permissions" | "input" | "elicitation";
  title: string;
  description: string;
  questions?: AgentQuestion[];
}
export interface AgentChatDecision {
  requestId: string;
  promptId: string;
  decision: "accept" | "decline";
  answers?: Record<string, string>;
}
export function validAgentItems(value: unknown): value is AgentChatItem[] {
  return (
    Array.isArray(value) &&
    value.length <= 80 &&
    JSON.stringify(value).length <= 96000 &&
    value.every(
      (v) =>
        v &&
        Object.keys(v).every((k) =>
          ["id", "kind", "status", "title", "text", "phase"].includes(k),
        ) &&
        typeof v.id === "string" &&
        /^[\w:.-]{1,160}$/.test(v.id) &&
        agentKinds.includes(v.kind) &&
        ["running", "completed", "failed", "declined", "interrupted"].includes(
          v.status,
        ) &&
        typeof v.title === "string" &&
        v.title.length <= 200 &&
        (v.phase === undefined ||
          (v.kind === "message" &&
            ["commentary", "final_answer"].includes(v.phase))) &&
        (v.text === undefined ||
          (typeof v.text === "string" && v.text.length <= 32000)),
    )
  );
}
