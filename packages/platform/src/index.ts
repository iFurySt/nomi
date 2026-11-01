export interface RuntimeInfo {
  kind: "web" | "desktop";
  version: string;
  platform: string;
}

declare global {
  interface Window {
    nomiDesktop?: {
      requestUpdates?(
        method: "status" | "check" | "automatic",
        value?: boolean,
      ): Promise<{
        version: string;
        available: boolean;
        canCheck?: boolean;
        automatic?: boolean;
        reason?: string;
      }>;
      getRuntimeInfo(): Promise<RuntimeInfo>;
      requestDocuments?(
        method: import("@nomi/core").DocumentStorageMethod,
        params?: unknown,
      ): Promise<import("@nomi/core").ChatGPTResult<unknown>>;
      requestChatGPT?(
        method: import("@nomi/core").ChatGPTMethod,
        params?: unknown,
      ): Promise<import("@nomi/core").ChatGPTResult<unknown>>;
      onChatGPTDelta(
        callback: (event: import("@nomi/core").ChatGPTDelta) => void,
      ): () => void;
    };
  }
}

export async function getRuntimeInfo(): Promise<RuntimeInfo> {
  return (
    window.nomiDesktop?.getRuntimeInfo() ?? {
      kind: "web",
      version: "0.1.0",
      platform: "browser",
    }
  );
}
export * from "./storage";
export * from "./chatgpt";
export * from "./learning";
export * from "./canvas";
export * from "./document-directory";
