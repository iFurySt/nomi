import { afterEach, expect, it, vi } from "vitest";
import { requestChatGPT, respondWithChatGPT } from "./chatgpt";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("requires the desktop capability instead of sending credentials or requests from Web", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("window", {});
  await expect(requestChatGPT("signIn")).rejects.toThrow("desktop app");
  expect(fetcher).not.toHaveBeenCalled();
});
it("filters stream events by request and always removes the listener after failure", async () => {
  const unsubscribe = vi.fn(),
    delta = vi.fn();
  vi.stubGlobal("window", {
    nomiDesktop: {
      onChatGPTDelta(
        listener: (event: { requestId: string; text: string }) => void,
      ) {
        listener({ requestId: "different", text: "wrong reply" });
        listener({ requestId: "request-1", text: "partial" });
        return unsubscribe;
      },
      requestChatGPT: async () => ({
        ok: false,
        error: "Usage limit. Manage usage.",
      }),
    },
  });
  await expect(
    respondWithChatGPT(
      {
        requestId: "request-1",
        profileId: "profile",
        model: "model",
        messages: [{ role: "user", content: "hello" }],
      },
      delta,
    ),
  ).rejects.toThrow("Manage usage");
  expect(delta).toHaveBeenCalledExactlyOnceWith("partial");
  expect(unsubscribe).toHaveBeenCalledExactlyOnceWith();
});

it("coalesces snapshots, flushes before prompts and preserves terminal text without a dangling timer", async () => {
  vi.useFakeTimers();
  let listener!: (e: import("@nomi/core").ChatGPTDelta) => void;
  let settle!: (r: unknown) => void;
  const unsubscribe = vi.fn(),
    delta = vi.fn(),
    agent = vi.fn();
  vi.stubGlobal("window", {
    nomiDesktop: {
      onChatGPTDelta: (callback: typeof listener) => {
        listener = callback;
        return unsubscribe;
      },
      requestChatGPT: () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    },
  });
  const pending = respondWithChatGPT(
    {
      requestId: "r",
      profileId: "p",
      model: "m",
      messages: [{ role: "user", content: "Hi" }],
    },
    delta,
    undefined,
    agent,
  );
  for (let i = 0; i < 1000; i++)
    listener({
      requestId: "r",
      text: "x",
      item: {
        id: "m",
        kind: "message",
        status: "running",
        title: "Nomi",
        text: String(i),
      },
    });
  expect(agent).not.toHaveBeenCalled();
  listener({
    requestId: "r",
    text: "",
    prompt: {
      id: "p",
      kind: "permissions",
      title: "Review",
      description: "Allow?",
    },
  });
  expect(delta).toHaveBeenCalledExactlyOnceWith("x".repeat(1000));
  expect(agent).toHaveBeenCalledTimes(2);
  expect(agent.mock.calls[0][0].item.text).toBe("999");
  expect(agent.mock.calls[1][0].prompt.id).toBe("p");
  listener({ requestId: "r", text: "end" });
  settle({ ok: true, value: { text: "complete" } });
  await pending;
  expect(delta).toHaveBeenLastCalledWith("end");
  expect(vi.getTimerCount()).toBe(0);
  expect(unsubscribe).toHaveBeenCalledOnce();
});
