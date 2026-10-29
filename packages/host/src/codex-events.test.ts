import { expect, it } from "vitest";
import { CodexEvents } from "./codex-events";
import { validChatReplyDetails } from "../../core/src/chat-content";

it("reduces the item matrix, preserves message order, ignores reasoning and bounds output", () => {
  const emitted: unknown[] = [];
  const r = new CodexEvents(
    "req",
    (e) => emitted.push(e),
    (s) => s.replaceAll("secret-token", "[redacted]"),
  );
  r.event("item/agentMessage/delta", { itemId: "m1", delta: "Checking " });
  r.event("item/agentMessage/delta", { itemId: "m1", delta: "sources" });
  r.event("item/completed", {
    item: {
      id: "m1",
      type: "agentMessage",
      text: "Checking sources",
      phase: "commentary",
    },
  });
  const types = [
    "plan",
    "webSearch",
    "commandExecution",
    "fileChange",
    "mcpToolCall",
    "dynamicToolCall",
    "collabAgentToolCall",
    "contextCompaction",
    "enteredReviewMode",
    "futureItem",
  ];
  for (const [index, type] of types.entries()) {
    r.event("item/started", {
      item: {
        id: `i${index}`,
        type,
        command: "echo secret-token",
        query: "SEC",
        tool: "lookup",
        changes: [{ path: "report.md", diff: "+fact" }],
      },
    });
    r.event("item/completed", {
      item: {
        id: `i${index}`,
        type,
        command: "echo secret-token",
        tool: "lookup",
        status: index === 4 ? "failed" : "completed",
      },
    });
  }
  r.event("item/started", {
    item: { id: "hidden", type: "reasoning", content: ["secret"] },
  });
  r.event("item/completed", {
    item: { id: "m2", type: "agentMessage", text: "Final answer" },
  });
  const items = r.finish();
  expect(items[0].text).toBe("Checking sources");
  expect(r.reply).toBe("Final answer");
  expect(items[0].phase).toBe("commentary");
  expect(items.some((i) => i.id === "hidden")).toBe(false);
  expect(JSON.stringify(items)).not.toContain("secret-token");
  expect(items.find((i) => i.id === "i4")?.status).toBe("failed");
  expect(
    validChatReplyDetails({ tools: [], citations: [], durationMs: 1, items }),
  ).toBe(true);
  expect(emitted.length).toBeGreaterThan(10);
  for (let i = 0; i < 100; i++)
    r.event("item/agentMessage/delta", {
      itemId: `large${i}`,
      delta: "x".repeat(33000),
    });
  expect(r.items.size).toBeLessThanOrEqual(80);
  expect(JSON.stringify([...r.items.values()]).length).toBeLessThan(96000);
});
it("settles interrupted activity and does not reopen completed items", () => {
  const r = new CodexEvents("r", () => {});
  r.event("item/completed", { item: { id: "x", type: "webSearch" } });
  r.event("item/started", { item: { id: "x", type: "webSearch" } });
  r.event("turn/plan/updated", {
    plan: [{ step: "Read", status: "inProgress" }],
  });
  expect(r.finish(true).find((i) => i.id === "turn-plan")?.status).toBe(
    "failed",
  );
  expect(r.items.get("x")?.status).toBe("completed");
});
it("preserves the final answer when earlier activity fills the display budget", () => {
  const r = new CodexEvents("r", () => {});
  for (let i = 0; i < 20; i++)
    r.event("item/completed", {
      item: {
        id: "c" + i,
        type: "commandExecution",
        command: "x".repeat(1000),
        aggregatedOutput: "x".repeat(6000),
      },
    });
  r.event("item/completed", {
    item: {
      id: "final",
      type: "agentMessage",
      text: "The final result is verified.",
    },
  });
  expect(r.reply).toBe("The final result is verified.");
  expect(
    validChatReplyDetails({
      tools: [],
      citations: [],
      durationMs: 1,
      items: r.finish(),
    }),
  ).toBe(true);
});

it("keeps phase through deltas, suppresses duplicate snapshots and exposes safe code-mode outputs", () => {
  const emitted: unknown[] = [];
  const r = new CodexEvents("r", (e) => emitted.push(e));
  r.event("item/started", {
    item: { id: "p", type: "agentMessage", phase: "commentary", text: "" },
  });
  r.event("item/agentMessage/delta", { itemId: "p", delta: "Checking" });
  expect(r.items.get("p")?.phase).toBe("commentary");
  expect(r.items.get("p")?.title).toBe("Progress");
  const count = emitted.length;
  r.event("item/agentMessage/delta", { itemId: "p", delta: "" });
  expect(emitted).toHaveLength(count);
  r.event("item/completed", {
    item: {
      id: "output",
      type: "functionCallOutput",
      name: "exec",
      output: [
        { type: "input_text", text: "Verified output" },
        { type: "encrypted_content", encrypted_content: "private" },
        { type: "input_image", image_url: "private" },
      ],
    },
  });
  expect(r.items.get("output")?.text).toBe("Verified output");
  r.event("item/completed", {
    item: {
      id: "f",
      type: "agentMessage",
      phase: "final_answer",
      text: "Conclusion",
    },
  });
  expect(r.reply).toBe("Conclusion");
  const details = {
    tools: [],
    citations: [],
    durationMs: 1,
    items: r.finish(),
  };
  expect(validChatReplyDetails(details)).toBe(true);
  expect(
    validChatReplyDetails({
      ...details,
      items: [{ ...r.items.get("f"), phase: "unknown" }],
    }),
  ).toBe(false);
  expect(
    validChatReplyDetails({
      ...details,
      items: [{ ...r.items.get("output"), phase: "commentary" }],
    }),
  ).toBe(false);
});

it("renders focused MCP operations and extracts only bounded source metadata", () => {
  const events: any[] = [];
  const reducer = new CodexEvents("mcp", (e) => events.push(e));
  reducer.event("item/completed", {
    item: {
      id: "mcp-prices",
      type: "mcpToolCall",
      server: "nomi",
      tool: "query_prices",
      status: "completed",
      arguments: { private: "not renderer data" },
      result: {
        structuredContent: {
          rows: [{ raw: "not renderer data" }],
          evidence: [
            { url: "https://finance.yahoo.com/quote/AAPL", provider: "yahoo" },
            { url: "file:///private/source", provider: "private" },
          ],
        },
      },
    },
  });
  expect(reducer.items.get("mcp-prices")?.title).toBe("Read price history");
  expect(reducer.sources.size).toBe(1);
  expect(JSON.stringify(events)).not.toContain("not renderer data");
});
