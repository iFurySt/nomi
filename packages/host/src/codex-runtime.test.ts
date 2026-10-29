import { expect, it, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexRuntime } from "./codex-runtime";
import type { CodexRPC } from "./codex-rpc";
import type { ChatGPTDelta } from "../../core/src/chatgpt";
const dirs: string[] = [];
afterEach(() =>
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })),
);
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "nomi-codex-test-"));
  dirs.push(dir);
  const calls: any[] = [],
    replies: any[] = [],
    instances: Fake[] = [];
  class Fake {
    closed = false;
    onMessage: (m: string, p: any, id?: string | number) => void = () => {};
    onClose = () => {};
    request(method: string, params: any) {
      calls.push({ method, params });
      return Promise.resolve(
        method === "thread/start"
          ? { thread: { id: "thread-1" } }
          : method === "turn/start"
            ? { turn: { id: "turn-1" } }
            : {},
      );
    }
    send(m: any) {
      calls.push(m);
    }
    reply(id: any, result: any) {
      replies.push({ id, result });
    }
    reject(id: any) {
      replies.push({ id, rejected: true });
    }
    close() {
      this.closed = true;
      this.onClose();
    }
  }
  const readData = async (query: string) => ({
    query,
    items: [{ symbol: "AAPL" }],
  });
  let childEnv: NodeJS.ProcessEnv = {};
  const runtime = new CodexRuntime("binary", dir, readData, (_b, _a, env) => {
    childEnv = env;
    const f = new Fake();
    instances.push(f);
    return f as unknown as CodexRPC;
  });
  return { runtime, dir, calls, replies, instances, env: () => childEnv };
}
const request = {
  requestId: "r1",
  conversationId: "c1",
  profileId: "p1",
  model: "gpt-test",
  messages: [{ role: "user" as const, content: "hello" }],
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
it("initializes, executes a namespaced local tool, handles decisions/input and resumes with token deltas", async () => {
  const s = setup(),
    events: ChatGPTDelta[] = [],
    usages: any[] = [];
  const first = s.runtime.run(
    request,
    "private-token",
    new AbortController().signal,
    (e) => events.push(e),
    (u) => usages.push(u),
  );
  await tick();
  const rpc = s.instances[0];
  expect(s.calls[0].params.clientInfo.name).toBe("Nomi");
  expect(s.env().ACCESS_TOKEN).toBe("private-token");
  expect(Object.keys(s.env())).not.toContain("OPENAI_API_KEY");
  expect(
    s.calls.find((c) => c.method === "thread/start").params.dynamicTools[0]
      .type,
  ).toBe("namespace");
  rpc.onMessage(
    "item/tool/call",
    {
      threadId: "thread-1",
      turnId: "turn-1",
      namespace: "nomi",
      tool: "search_stocks",
      arguments: { query: "Apple" },
    },
    8,
  );
  await tick();
  expect(s.replies[0].result.success).toBe(true);
  rpc.onMessage(
    "item/commandExecution/requestApproval",
    { threadId: "thread-1", turnId: "turn-1", command: "cat report.md" },
    9,
  );
  const prompt = events.at(-1)!.prompt!;
  expect(() =>
    s.runtime.answer({
      requestId: "other",
      promptId: prompt.id,
      decision: "accept",
    }),
  ).toThrow();
  s.runtime.answer({
    requestId: "r1",
    promptId: prompt.id,
    decision: "decline",
  });
  expect(s.replies.at(-1).result).toEqual({ decision: "decline" });
  rpc.onMessage(
    "item/tool/requestUserInput",
    {
      threadId: "thread-1",
      questions: [
        { id: "q", question: "Period?", options: [{ label: "Annual" }] },
      ],
    },
    10,
  );
  s.runtime.answer({
    requestId: "r1",
    promptId: events.at(-1)!.prompt!.id,
    decision: "accept",
    answers: { q: "Annual" },
  });
  expect(s.replies.at(-1).result.answers.q.answers).toEqual(["Annual"]);
  rpc.onMessage(
    "item/permissions/requestApproval",
    {
      threadId: "thread-1",
      permissions: { network: { enabled: true }, fileSystem: null },
    },
    11,
  );
  s.runtime.answer({
    requestId: "r1",
    promptId: events.at(-1)!.prompt!.id,
    decision: "decline",
  });
  expect(s.replies.at(-1).result.permissions).toEqual({});
  rpc.onMessage("future/request", {}, 99);
  expect(s.replies.at(-1).rejected).toBe(true);
  rpc.onMessage("item/completed", {
    threadId: "other",
    item: { id: "bad", type: "agentMessage", text: "wrong thread" },
  });
  rpc.onMessage("item/completed", {
    threadId: "thread-1",
    turnId: "turn-1",
    item: { id: "m", type: "agentMessage", text: "Answer" },
  });
  const tokens = (n: number) => ({
    threadId: "thread-1",
    turnId: "turn-1",
    tokenUsage: {
      total: {
        inputTokens: n * 10,
        outputTokens: n * 2,
        totalTokens: n * 12,
        cachedInputTokens: 0,
        reasoningOutputTokens: 0,
      },
    },
  });
  rpc.onMessage("thread/tokenUsage/updated", tokens(1));
  rpc.onMessage("thread/tokenUsage/updated", tokens(2));
  rpc.onMessage("turn/completed", {
    threadId: "thread-1",
    turn: { status: "completed" },
  });
  expect((await first).text).toBe("Answer");
  expect(usages.at(-1).totalTokens).toBe(24);
  const second = s.runtime.run(
    { ...request, requestId: "r2" },
    "new-token",
    new AbortController().signal,
    (e) => events.push(e),
    (u) => usages.push(u),
  );
  await tick();
  const next = s.instances[1];
  expect(s.calls.some((c) => c.method === "thread/resume")).toBe(true);
  next.onMessage("thread/tokenUsage/updated", tokens(3));
  next.onMessage("item/completed", {
    threadId: "thread-1",
    item: { id: "m2", type: "agentMessage", text: "Next" },
  });
  next.onMessage("turn/completed", {
    threadId: "thread-1",
    turn: { status: "completed" },
  });
  await second;
  expect(usages.at(-1).totalTokens).toBe(12);
  s.runtime.close();
});
it("interrupts, rejects crashes and never treats failed or empty completion as success", async () => {
  for (const mode of ["abort", "crash", "failed", "empty"]) {
    const s = setup(),
      controller = new AbortController();
    const result = s.runtime.run(
      request,
      "token",
      controller.signal,
      () => {},
      () => {},
    );
    const check = expect(result).rejects.toThrow();
    await tick();
    const rpc = s.instances[0];
    if (mode === "abort") controller.abort();
    if (mode === "crash") rpc.close();
    if (mode === "failed" || mode === "empty")
      rpc.onMessage("turn/completed", {
        threadId: "thread-1",
        turn: { status: mode === "empty" ? "completed" : "failed" },
      });
    await check;
    s.runtime.close();
  }
});

it("adds hosted-search usage once to the Codex turn and retains real source activity", async () => {
  const s = setup(),
    events: ChatGPTDelta[] = [],
    usages: any[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      [
        { type: "response.web_search_call.searching", item_id: "ws1" },
        { type: "response.output_text.delta", delta: "Fact" },
        {
          type: "response.output_item.done",
          item: {
            type: "web_search_call",
            id: "ws1",
            status: "completed",
            action: {
              type: "search",
              query: "SEC",
              sources: [{ url: "https://www.sec.gov/", title: "SEC" }],
            },
          },
        },
        {
          type: "response.completed",
          response: {
            status: "completed",
            usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
          },
        },
      ]
        .map((f) => "data: " + JSON.stringify(f) + "\n\n")
        .join(""),
      { headers: { "Content-Type": "text/event-stream" } },
    ),
  );
  try {
    const result = s.runtime.run(
      request,
      "token",
      new AbortController().signal,
      (e) => events.push(e),
      (u) => usages.push(u),
    );
    await tick();
    const rpc = s.instances[0];
    rpc.onMessage(
      "item/tool/call",
      {
        threadId: "thread-1",
        namespace: "nomi",
        tool: "web_search",
        arguments: { query: "SEC" },
      },
      22,
    );
    for (let i = 0; i < 20 && !s.replies.length; i++) await tick();
    expect(s.replies[0].result.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    rpc.onMessage("thread/tokenUsage/updated", {
      threadId: "thread-1",
      tokenUsage: {
        total: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    });
    rpc.onMessage("item/completed", {
      threadId: "thread-1",
      item: { id: "answer", type: "agentMessage", text: "Answer" },
    });
    rpc.onMessage("turn/completed", {
      threadId: "thread-1",
      turn: { status: "completed" },
    });
    const done = await result;
    expect(done.details.sources?.[0].url).toBe("https://www.sec.gov/");
    expect(usages).toHaveLength(1);
    expect(usages[0].totalTokens).toBe(135);
    expect(events.some((e) => e.item?.kind === "search")).toBe(true);
  } finally {
    spy.mockRestore();
    s.runtime.close();
  }
});
it("keeps recovery usage unknown after an unmeasured interruption instead of recounting old tokens", async () => {
  const s = setup(),
    usages: any[] = [];
  const first = s.runtime.run(
    request,
    "token",
    new AbortController().signal,
    () => {},
    (u) => usages.push(u),
  );
  await tick();
  const rpc = s.instances[0];
  rpc.onMessage("item/completed", {
    threadId: "thread-1",
    item: { id: "m", type: "agentMessage", text: "First" },
  });
  rpc.onMessage("thread/tokenUsage/updated", {
    threadId: "thread-1",
    tokenUsage: {
      total: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    },
  });
  rpc.onMessage("turn/completed", {
    threadId: "thread-1",
    turn: { status: "completed" },
  });
  await first;
  const path = join(s.dir, "p1", "threads.json");
  const binding = JSON.parse(readFileSync(path, "utf8"));
  binding.c1.pending = true;
  writeFileSync(path, JSON.stringify(binding));
  const recovered = s.runtime.run(
    { ...request, requestId: "r2" },
    "token",
    new AbortController().signal,
    () => {},
    (u) => usages.push(u),
  );
  await tick();
  rpc.onMessage("thread/tokenUsage/updated", {
    threadId: "thread-1",
    tokenUsage: {
      total: { inputTokens: 30, outputTokens: 15, totalTokens: 45 },
    },
  });
  rpc.onMessage("item/completed", {
    threadId: "thread-1",
    item: { id: "m2", type: "agentMessage", text: "Recovered" },
  });
  rpc.onMessage("turn/completed", {
    threadId: "thread-1",
    turn: { status: "completed" },
  });
  await recovered;
  expect(usages).toHaveLength(1);
  expect(JSON.parse(readFileSync(path, "utf8")).c1.total.totalTokens).toBe(45);
  s.runtime.close();
});

it("closes the owned process when cancelled during initialization", async () => {
  const s = setup(),
    c = new AbortController();
  const response = s.runtime.run(
    request,
    "token",
    c.signal,
    () => {},
    () => {},
  );
  c.abort();
  await expect(response).rejects.toThrow();
  expect(s.instances[0].closed).toBe(true);
  expect(s.calls.some((c) => c.method === "turn/start")).toBe(false);
  s.runtime.close();
});
