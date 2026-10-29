import type {
  ChatGPTMethod,
  ChatGPTResult,
  ChatGPTStatus,
  ChatGPTModel,
  ChatGPTRequest,
  ChatGPTDelta,
} from "@nomi/core";

export const chatGPTAvailable = () => !!window.nomiDesktop?.requestChatGPT;
export async function requestChatGPT<T>(
  method: ChatGPTMethod,
  params?: unknown,
): Promise<T> {
  if (!window.nomiDesktop?.requestChatGPT)
    throw Error("Open the desktop app to connect ChatGPT.");
  const result = (await window.nomiDesktop.requestChatGPT(
    method,
    params,
  )) as ChatGPTResult<T>;
  if (!result.ok) throw Error(result.error);
  return result.value;
}
export const readChatGPTStatus = () => requestChatGPT<ChatGPTStatus>("status");
export const listChatGPTModels = (profileId: string) =>
  requestChatGPT<ChatGPTModel[]>("models", { profileId });
export async function respondWithChatGPT(
  request: ChatGPTRequest,
  onDelta: (text: string) => void,
  onActivity?: (activity: import("@nomi/core").ChatToolStep) => void,
  onAgent?: (event: ChatGPTDelta) => void,
) {
  // IPC can deliver hundreds of token snapshots per second. Keep only the
  // latest snapshot per item and publish at most once every 32ms. Prompts and
  // settlement flush synchronously, so decisions and final text cannot be lost.
  let text = "";
  const activities = new Map<string, import("@nomi/core").ChatToolStep>();
  const items = new Map<string, ChatGPTDelta>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (text) onDelta(text);
    text = "";
    for (const activity of activities.values()) onActivity?.(activity);
    activities.clear();
    for (const event of items.values()) onAgent?.(event);
    items.clear();
  };
  const unsubscribe = window.nomiDesktop?.onChatGPTDelta(
    (event: ChatGPTDelta) => {
      if (event.requestId === request.requestId) {
        text += event.text;
        if (event.activity) activities.set(event.activity.id, event.activity);
        if (event.item) items.set(event.item.id, { ...event, text: "" });
        if (event.prompt || event.resolvedPromptId) {
          flush();
          onAgent?.(event);
        } else if (!timer) timer = setTimeout(flush, 32);
      }
    },
  );
  try {
    return await requestChatGPT<{
      text: string;
      details?: import("@nomi/core").ChatReplyDetails;
      usageWarning?: string;
    }>("respond", request);
  } finally {
    unsubscribe?.();
    flush();
  }
}
