export interface RuntimeInfo {
  kind: "web" | "desktop";
  version: string;
  platform: string;
}

declare global {
  interface Window {
    nomiDesktop?: {
      getRuntimeInfo(): Promise<RuntimeInfo>;
      requestData(
        method: import("@nomi/core").DataMethod,
        params?: unknown,
      ): Promise<unknown>;
      requestChatGPT?(
        method: import("@nomi/core").ChatGPTMethod,
        params?: unknown,
      ): Promise<import("@nomi/core").ChatGPTResult<unknown>>;
      requestArena?(
        method: import("@nomi/core").ArenaMethod,
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

export * from "./data-service";

export * from "./stock-directory";

export * from "./stock-logos";

export * from "./stock-collection";
export * from "./stock-research";
export * from "./chatgpt";

export * from "./fund-logos";

export * from "./arena";

export * from "./learning";

export * from "./canvas";
