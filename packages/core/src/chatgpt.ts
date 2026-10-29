import { validChatReplyDetails } from "./chat-content";
import type { Message } from "./workspace";

export interface ChatGPTProfile {
  id: string;
  label: string;
  name?: string;
  email?: string;
  connected: boolean;
  sharing: boolean;
}
export interface ChatGPTStatus {
  profiles: ChatGPTProfile[];
  activeProfileId?: string;
  signingIn: boolean;
  welcomeSeen: boolean;
}
export const chatGPTEfforts = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ChatGPTEffort = (typeof chatGPTEfforts)[number];
export interface ChatGPTModel {
  slug: string;
  displayName: string;
  reasoningEfforts?: ChatGPTEffort[];
  defaultEffort?: ChatGPTEffort;
  contextWindow?: number;
}
export interface ChatGPTRequest {
  requestId: string;
  profileId: string;
  model: string;
  messages: Message[];
  conversationId?: string;
  effort?: ChatGPTEffort;
  webSearch?: boolean;
}
export type ChatGPTMethod =
  | "status"
  | "signIn"
  | "cancelSignIn"
  | "selectProfile"
  | "signOut"
  | "models"
  | "respond"
  | "cancelResponse"
  | "answerPrompt"
  | "openSource"
  | "openUsage"
  | "acknowledgeWelcome";
export const chatGPTMethods: readonly ChatGPTMethod[] = [
  "status",
  "signIn",
  "cancelSignIn",
  "selectProfile",
  "signOut",
  "models",
  "respond",
  "cancelResponse",
  "answerPrompt",
  "openUsage",
  "openSource",
  "acknowledgeWelcome",
];
export type ChatGPTResult<T> =
  { ok: true; value: T } | { ok: false; error: string };
export interface ChatGPTDelta {
  requestId: string;
  text: string;
  activity?: import("./chat-content").ChatToolStep;
  item?: import("./agent-chat").AgentChatItem;
  prompt?: import("./agent-chat").AgentChatPrompt;
  resolvedPromptId?: string;
}
export const chatGPTOutputLimit = 32000;
export function validateChatGPTRequest(
  value: unknown,
): asserts value is ChatGPTRequest {
  if (!value || typeof value !== "object") throw Error("Invalid chat request.");
  const v = value as ChatGPTRequest;
  if (
    Object.keys(v).some(
      (k) =>
        ![
          "requestId",
          "profileId",
          "model",
          "messages",
          "conversationId",
          "effort",
          "webSearch",
        ].includes(k),
    ) ||
    (v.conversationId !== undefined && !validChatGPTId(v.conversationId)) ||
    (v.effort !== undefined && !chatGPTEfforts.includes(v.effort)) ||
    (v.webSearch !== undefined && typeof v.webSearch !== "boolean") ||
    !validChatGPTId(v.requestId) ||
    !validChatGPTId(v.profileId) ||
    typeof v.model !== "string" ||
    !/^[a-zA-Z0-9._:-]{1,160}$/.test(v.model) ||
    !Array.isArray(v.messages) ||
    !v.messages.length ||
    v.messages.length > 100 ||
    v.messages.some(
      (m) =>
        !m ||
        typeof m !== "object" ||
        Object.keys(m).some(
          (k) => !["role", "content", "source", "details"].includes(k),
        ) ||
        !["user", "assistant"].includes(m.role) ||
        (m.details !== undefined && !validChatReplyDetails(m.details)) ||
        typeof m.content !== "string" ||
        !m.content.trim() ||
        m.content.length > (m.role === "user" ? 2000 : chatGPTOutputLimit),
    ) ||
    v.messages.at(-1)?.role !== "user" ||
    v.messages.reduce((n, m) => n + m.content.length, 0) > 100000
  )
    throw Error("Chat is too long or invalid. Start a new chat.");
}
export const validChatGPTId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
