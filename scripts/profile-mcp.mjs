// Opt-in, read-only real-store MCP profiling. Never opens the writer service.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const args = process.argv.slice(2);
if (!args[0])
  throw Error(
    "Usage: node scripts/profile-mcp.mjs /absolute/data-dir [SYMBOL]",
  );
const symbol = args[1] ?? "AAPL";
const child = spawn(
  resolve(
    "apps/desktop/dist",
    process.platform === "win32" ? "nomi.exe" : "nomi",
  ),
  ["--data-dir", resolve(args[0]), "mcp", "serve"],
  { stdio: ["pipe", "pipe", "pipe"] },
);
child.stderr.resume();
let sequence = 0;
const pending = new Map();
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    throw Error("Non-protocol stdout");
  }
  const p = pending.get(m.id);
  if (p) {
    pending.delete(m.id);
    clearTimeout(p.timer);
    m.error ? p.reject(Error("MCP protocol error")) : p.resolve(m.result);
  }
});
function rpc(method, params) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("MCP read timed out"));
    }, 5000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
  });
}
try {
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "nomi-readonly-profiler", version: "1" },
  });
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
      "\n",
  );
  const tools = await rpc("tools/list", {});
  if (tools.tools.length !== 8) throw Error("Expected eight research tools");
  let evidenceId;
  const report = {
    transport: "standard MCP stdio",
    symbol,
    samples: 30,
    tools: [],
  };
  const input = {
    describe_data: { symbols: [symbol] },
    search_instruments: { query: symbol },
    get_company_overview: { symbols: [symbol] },
    query_financials: { symbols: [symbol], metrics: ["revenue"] },
    query_prices: { symbols: [symbol] },
    query_disclosures: { symbols: [symbol], kind: "filings" },
    query_ownership: { symbols: [symbol] },
  };
  for (const name of [
    "describe_data",
    "search_instruments",
    "get_company_overview",
    "query_financials",
    "query_prices",
    "query_disclosures",
    "query_ownership",
    "read_evidence",
  ]) {
    const timings = [];
    let bytes = 0,
      rows = 0,
      state = "success";
    for (let n = 0; n < 31; n++) {
      const start = performance.now();
      const result = await rpc("tools/call", {
        name,
        arguments:
          name === "read_evidence"
            ? { evidenceId: evidenceId ?? "ev:" + "0".repeat(64) }
            : input[name],
      });
      if (n > 0) timings.push(performance.now() - start);
      bytes = Math.max(bytes, Buffer.byteLength(JSON.stringify(result)));
      if (bytes > 49152) throw Error("Wire budget exceeded");
      const data = result.structuredContent;
      rows = data?.rows?.length ?? 0;
      evidenceId ??= data?.evidence?.[0]?.id;
      if (result.isError) state = "tool-error";
    }
    timings.sort((a, b) => a - b);
    report.tools.push({
      name,
      state,
      rows,
      wireBytes: bytes,
      p50Ms: +timings[15].toFixed(2),
      p95Ms: +timings[28].toFixed(2),
    });
  }
  mkdirSync(".artifacts/mcp", { recursive: true });
  writeFileSync(
    ".artifacts/mcp/real-store-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.tools.some((t) => t.state !== "success")) process.exitCode = 1;
} finally {
  child.stdin.end();
  lines.close();
  await new Promise((resolve) => {
    const timeout = setTimeout(() => child.kill(), 1000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
