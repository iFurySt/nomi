// Real Codex → MCP child verification with a deterministic model endpoint.
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexRPC } from "../../packages/host/src/codex-rpc";
import { CodexRuntime } from "../../packages/host/src/codex-runtime";
const home = mkdtempSync(join(tmpdir(), "nomi-mcp-codex-"));
const root = process.cwd();
const wrapper = join(home, "mcp-child");
writeFileSync(
  wrapper,
  `#!${process.execPath}\nconst fs=require('node:fs');const cp=require('node:child_process');fs.writeFileSync(${JSON.stringify(join(home, "environment.json"))},JSON.stringify({accessToken:!!process.env.ACCESS_TOKEN,apiKey:!!process.env.OPENAI_API_KEY}));const child=cp.spawn(${JSON.stringify(join(root, "apps/desktop/dist/nomi"))},process.argv.slice(2),{stdio:'inherit',env:process.env});child.on('exit',(code)=>process.exit(code??1));process.on('SIGTERM',()=>child.kill());`,
  { mode: 0o700 },
);
let calls = 0,
  catalog = false,
  returned = false;
const mcpEvents: any[] = [];
const server = createServer(async (req, res) => {
  const parts = [];
  for await (const p of req) parts.push(p);
  const request = JSON.parse(Buffer.concat(parts).toString());
  calls++;
  const serialized = JSON.stringify(request.input ?? []);
  if (calls === 2) {
    returned =
      serialized.includes("nomi.research.v1") &&
      serialized.includes("storeState");
    catalog =
      serialized.includes("mcp__nomi__read_evidence") &&
      serialized.includes("mcp__nomi__query_prices") &&
      !serialized.includes("search_stocks");
  }
  const item =
    calls % 2 === 1
      ? {
          type: "custom_tool_call",
          id: `fc${calls}`,
          call_id: `call${calls}`,
          namespace: "functions",
          name: "exec",
          input:
            'text(ALL_TOOLS.filter(t=>t.name.startsWith("mcp__nomi__")).map(t=>t.name)); text(await tools.mcp__nomi__describe_data({}));',
        }
      : {
          id: `msg${calls}`,
          type: "message",
          role: "assistant",
          phase: "final_answer",
          status: "completed",
          content: [
            { type: "output_text", text: "MCP verified.", annotations: [] },
          ],
        };
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const emit = (x: unknown) => res.write(`data: ${JSON.stringify(x)}\n\n`);
  emit({
    type: "response.created",
    response: { id: `r${calls}`, status: "in_progress", output: [] },
  });
  emit({ type: "response.output_item.added", output_index: 0, item });
  if (calls % 2 === 0)
    emit({
      type: "response.output_text.delta",
      item_id: `msg${calls}`,
      output_index: 0,
      content_index: 0,
      delta: "MCP verified.",
    });
  emit({ type: "response.output_item.done", output_index: 0, item });
  emit({
    type: "response.completed",
    response: {
      id: `r${calls}`,
      status: "completed",
      output: [item],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    },
  });
  res.end();
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const addr = server.address();
if (!addr || typeof addr === "string") throw Error("Missing port");
const runtime = new CodexRuntime(
  join(root, "apps/desktop/dist/codex/bin/codex"),
  join(home, "agent"),
  undefined,
  (b, args, env, cwd) => {
    const rpc = new CodexRPC(
      b,
      [
        ...args,
        "-c",
        `model_providers.openai_chatgpt_plan.base_url="http://127.0.0.1:${addr.port}/v1"`,
      ],
      env,
      cwd,
    );
    let handler: any;
    Object.defineProperty(rpc, "onMessage", {
      set(next) {
        handler = next;
      },
      get() {
        return (m: string, p: any, id: any) => {
          if (p?.item?.type === "mcpToolCall")
            mcpEvents.push({
              tool: p.item.tool,
              status: p.item.status,
              error: !!p.item.error,
            });
          handler?.(m, p, id);
        };
      },
    });
    return rpc;
  },
  { binary: wrapper, dataDir: join(home, "uncollected") },
);
try {
  const result = await runtime.run(
    {
      requestId: "mcp-smoke",
      conversationId: "mcp-chat",
      profileId: "synthetic",
      model: "gpt-6.1-sol",
      messages: [{ role: "user", content: "Describe local data" }],
    },
    "synthetic-private-token",
    AbortSignal.timeout(20000),
    () => {},
    () => {},
  );
  const environment = JSON.parse(
    readFileSync(join(home, "environment.json"), "utf8"),
  );
  if (
    result.text !== "MCP verified." ||
    calls !== 2 ||
    !catalog ||
    !returned ||
    environment.accessToken ||
    environment.apiKey ||
    !mcpEvents.some(
      (i) => i.tool === "describe_data" && i.status === "completed" && !i.error,
    )
  )
    throw Error(
      JSON.stringify({ catalog, returned, calls, environment, mcpEvents }),
    );
  for (const reconnect of [false, true]) {
    if (reconnect) runtime.close();
    const next = await runtime.run(
      {
        requestId: "mcp-smoke-" + String(reconnect),
        conversationId: "mcp-chat",
        profileId: "synthetic",
        model: "gpt-6.1-sol",
        messages: [{ role: "user", content: "Describe local data again" }],
      },
      "synthetic-private-token",
      AbortSignal.timeout(20000),
      () => {},
      () => {},
    );
    if (next.text !== "MCP verified.")
      throw Error("MCP resume/reconnect failed");
  }
  if (
    calls !== 6 ||
    mcpEvents.filter((i) => i.status === "completed" && !i.error).length !== 3
  )
    throw Error("MCP lifecycle incomplete");
  console.log(
    JSON.stringify({
      realCodex: true,
      realMCPChild: true,
      resumedAndReconnected: true,
      nonDuplicateCatalog: catalog,
      structuredResultReturned: returned,
      secretEnvironmentIsolated: true,
      mcpEvents,
    }),
  );
} finally {
  runtime.close();
  server.closeAllConnections();
  server.close();
  setTimeout(() => rmSync(home, { recursive: true, force: true }), 500);
}
