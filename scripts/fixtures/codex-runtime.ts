// Real bundled Codex process against a local synthetic Responses server. No credentials/network providers.
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexRPC } from "../../packages/host/src/codex-rpc";
import { CodexRuntime } from "../../packages/host/src/codex-runtime";
const home = mkdtempSync(join(tmpdir(), "nomi-runtime-smoke-"));
let calls = 0,
  toolCalls = 0;
const probeNativeSearch = process.env.NOMI_CODEX_NATIVE_SEARCH_PROBE === "1";
let nativeSearchAdvertised = false;
let catalogRegistered = false,
  outputReturned = false;
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  const request = JSON.parse(Buffer.concat(chunks).toString());
  calls++;
  nativeSearchAdvertised ||=
    request.tools?.some((t: any) => t.type?.startsWith("web_search")) ||
    (request.input ?? []).some(
      (i: any) =>
        i.type === "additional_tools" &&
        /"name":"web"|web__run/.test(JSON.stringify(i.tools)),
    );
  if (calls === 1)
    catalogRegistered =
      request.input?.some((i: any) => i.type === "additional_tools") ?? false;
  if (calls === 2)
    outputReturned = JSON.stringify(request.input).includes("AAPL");
  const call = {
    type: "function_call",
    id: "fc1",
    call_id: "call1",
    name: "search_stocks",
    namespace: "nomi",
    arguments: JSON.stringify({ query: "Apple" }),
  };
  const message = {
    id: "msg1",
    type: "message",
    role: "assistant",
    phase: "final_answer",
    status: "completed",
    content: [
      { type: "output_text", text: "Local tool verified.", annotations: [] },
    ],
  };
  const progress = {
    ...message,
    id: "progress",
    phase: "commentary",
    content: [
      { type: "output_text", text: "Checking local data.", annotations: [] },
    ],
  };
  const output = calls === 1 ? [progress, call] : [message];
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const emit = (v: unknown) => res.write(`data: ${JSON.stringify(v)}\n\n`);
  emit({
    type: "response.created",
    response: { id: `resp${calls}`, status: "in_progress", output: [] },
  });
  for (const [index, item] of output.entries()) {
    emit({ type: "response.output_item.added", output_index: index, item });
    if (calls !== 1)
      emit({
        type: "response.output_text.delta",
        item_id: "msg1",
        output_index: 0,
        content_index: 0,
        delta: "Local tool verified.",
      });
    emit({ type: "response.output_item.done", output_index: index, item });
  }
  emit({
    type: "response.completed",
    response: {
      id: `resp${calls}`,
      status: "completed",
      output,
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    },
  });
  res.end();
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw Error("No fixture port");
const root = process.cwd();
const runtime = new CodexRuntime(
  join(
    root,
    "apps/desktop/dist/codex/bin",
    process.platform === "win32" ? "codex.exe" : "codex",
  ),
  home,
  async (query) => {
    toolCalls++;
    return { query, items: [{ symbol: "AAPL", name: "Apple" }] };
  },
  (binary, args, env, cwd) =>
    new CodexRPC(
      binary,
      [
        ...args,
        ...(probeNativeSearch ? ["-c", 'web_search="live"'] : []),
        "-c",
        `model_providers.openai_chatgpt_plan.base_url="http://127.0.0.1:${address.port}/v1"`,
      ],
      env,
      cwd,
    ),
);
const events: string[] = [];
let usage: unknown;
try {
  const result = await runtime.run(
    {
      requestId: "smoke",
      profileId: "synthetic",
      conversationId: "chat",
      model: "gpt-6.1-sol",
      messages: [{ role: "user", content: "Find Apple" }],
    },
    "synthetic-no-access",
    AbortSignal.timeout(20000),
    (e) => {
      if (e.item) events.push(e.item.kind);
    },
    (u) => (usage = u),
  );
  if (
    result.text !== "Local tool verified." ||
    toolCalls !== 1 ||
    calls !== 2 ||
    !events.includes("tool") ||
    !usage ||
    !catalogRegistered ||
    !outputReturned ||
    !result.details.items?.some((i) => i.phase === "commentary") ||
    !result.details.items?.some((i) => i.phase === "final_answer")
  )
    throw Error("Real runtime loop/usage event check failed");
  console.log(
    JSON.stringify({
      realBundledProcess: true,
      agentLoop: true,
      localTool: true,
      usage,
      catalogRegistered,
      outputReturned,
      phaseSeparation: true,
      ...(probeNativeSearch
        ? {
            nativeSearchProbe: {
              configuredMode: "live",
              nativeSearchAdvertised,
            },
          }
        : {}),
    }),
  );
} finally {
  runtime.close();
  server.closeAllConnections();
  server.close();
  setTimeout(() => rmSync(home, { recursive: true, force: true }), 300);
}
