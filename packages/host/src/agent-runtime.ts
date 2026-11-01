import type {
  ChatGPTRequest,
  ChatGPTDelta,
  ChatReplyDetails,
  TokenUsage,
} from "../../core/src/index";
export interface AgentRunResult {
  text: string;
  details: ChatReplyDetails;
  usageWarning?: string;
}
export interface AgentRuntime {
  run(
    request: ChatGPTRequest,
    token: string,
    signal: AbortSignal,
    emit: (e: ChatGPTDelta) => void,
    usage: (u: TokenUsage) => void,
  ): Promise<AgentRunResult>;
  answer(params: unknown): void;
  close(): void;
}
