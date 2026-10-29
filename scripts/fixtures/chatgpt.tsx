// Synthetic transport only: no real credentials, browser authorization or inference.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../packages/ui/src/App";
import { emptyResearch } from "@nomi/core";
import "../../packages/ui/src/styles.css";
// Synthetic desktop capability for renderer regression only. It never opens a
// browser, reads a real credential, or sends inference requests.
const chatListeners = new Set<
  (value: import("@nomi/core").ChatGPTDelta) => void
>();
const chatFixture = {
  agentMode: false,
  burst: false,
  commits: 0,
  decision: undefined as ((v: unknown) => void) | undefined,
  failure: false,
  cancelled: false,
  delay: 40,
  requests: [] as unknown[],
};
Object.assign(window, { chatFixture });
window.nomiDesktop = {
  getRuntimeInfo: async () => ({
    kind: "web",
    version: "test",
    platform: "fixture",
  }),
  requestData: async (method) => {
    if (method === "usage.read") {
      const b = {
        key: "fixture-model",
        requests: 2,
        succeeded: 1,
        failed: 0,
        cancelled: 1,
        interrupted: 0,
        running: 0,
        measured: 1,
        inputTokens: 76,
        outputTokens: 5,
        totalTokens: 81,
        cachedTokens: 0,
        reasoningTokens: 0,
        cachedMeasured: 1,
        reasoningMeasured: 1,
        durationMs: 1000,
        longestMs: 800,
      };
      return {
        summary: b,
        daily: Array.from({ length: 365 }, (_, i) => ({
          ...b,
          key: new Date(Date.UTC(2025, 9, 18 + i)).toISOString().slice(0, 10),
          requests: i === 364 ? 2 : 0,
          totalTokens: i === 364 ? 81 : 0,
          measured: i === 364 ? 1 : 0,
        })),
        models: [b],
        efforts: [{ ...b, key: "low" }],
        accounts: [{ ...b, key: "fixture-profile" }],
        conversations: [],
        conversationCount: 1,
        activeDays: 1,
        currentStreak: 1,
        longestStreak: 1,
        peakDailyTokens: 81,
        timezone: "UTC",
        fromDay: "2025-10-18",
        firstRecordedAt: Date.UTC(2026, 9, 17),
        throughDay: "2026-10-17",
      };
    }
    throw Error("Fixture data bridge is unavailable.");
  },
  onChatGPTDelta: (callback) => {
    chatListeners.add(callback);
    return () => chatListeners.delete(callback);
  },
  requestChatGPT: async (method, params) => {
    if (method === "status")
      return {
        ok: true,
        value: {
          activeProfileId: "fixture-profile",
          welcomeSeen: true,
          signingIn: false,
          profiles: [
            {
              id: "fixture-profile",
              label: "Test account",
              name: "Test User",
              email: "test@example.invalid",
              connected: true,
              sharing: true,
            },
          ],
        },
      };
    if (method === "models")
      return {
        ok: true,
        value: [
          {
            slug: "fixture-model",
            displayName: "Fixture model",
            reasoningEfforts: ["low", "medium", "high"],
            defaultEffort: "low",
          },
        ],
      };
    if (method === "answerPrompt") {
      chatFixture.decision?.(params);
      return { ok: true, value: undefined };
    }
    if (method === "cancelResponse") {
      chatFixture.cancelled = true;
      return { ok: true, value: undefined };
    }
    if (method === "respond") {
      chatFixture.requests.push(params);
      chatFixture.cancelled = false;
      const { requestId, webSearch } = params as {
        requestId: string;
        webSearch?: boolean;
      };
      if (chatFixture.burst) {
        const emit = (
          text: string,
          status: "running" | "completed" = "running",
        ) => {
          for (const listener of chatListeners)
            listener({
              requestId,
              text: "",
              item: {
                id: "burst",
                kind: "message",
                title: "Nomi",
                phase: "final_answer",
                status,
                text,
              },
            });
        };
        let text = "```python\nprint('stable')\n```\n\n";
        emit(text);
        await new Promise((r) => setTimeout(r, 120));
        for (let batch = 0; batch < 40; batch++) {
          for (let i = 0; i < 25; i++) {
            text += "word ";
            emit(text);
          }
          await new Promise((r) => setTimeout(r, 5));
        }
        await new Promise((r) => setTimeout(r, 120));
        emit(text, "completed");
        return {
          ok: true,
          value: {
            text,
            details: {
              tools: [],
              citations: [],
              durationMs: 500,
              items: [
                {
                  id: "burst",
                  kind: "message",
                  title: "Nomi",
                  phase: "final_answer",
                  status: "completed",
                  text,
                },
              ],
            },
          },
        };
      }
      if (chatFixture.agentMode) {
        const emit = (e: Partial<import("@nomi/core").ChatGPTDelta>) => {
          for (const listener of chatListeners)
            listener({ requestId, text: "", ...e });
        };
        const items: import("@nomi/core").AgentChatItem[] = [
          {
            id: "progress",
            kind: "message",
            status: "completed",
            title: "Progress",
            phase: "commentary",
            text: "Checking local research data.",
          },
          {
            id: "plan",
            kind: "plan",
            status: "completed",
            title: "Plan",
            text: "Read data, then summarize.",
          },
          {
            id: "search",
            kind: "search",
            status: "completed",
            title: "Search the web",
            text: "SEC company filings",
          },
          {
            id: "tool",
            kind: "tool",
            status: "completed",
            title: "search_stocks",
            text: "Local data read completed",
          },
          {
            id: "command",
            kind: "command",
            status: "completed",
            title: "Run command",
            text: "cat report.md\n\nVerified",
          },
          {
            id: "file",
            kind: "file",
            status: "declined",
            title: "File changes",
            text: "report.md\n+Draft",
          },
          {
            id: "compact",
            kind: "compaction",
            status: "completed",
            title: "Compacting context",
          },
          {
            id: "child",
            kind: "agent",
            status: "completed",
            title: "Agent activity",
          },
          {
            id: "failed",
            kind: "tool",
            status: "failed",
            title: "Unavailable source",
            text: "Tool failed",
          },
          {
            id: "unknown",
            kind: "notice",
            status: "completed",
            title: "Additional activity",
            text: "Unsupported activity is displayed safely.",
          },
        ];
        for (const item of items) emit({ item });
        const ask = async (prompt: import("@nomi/core").AgentChatPrompt) => {
          emit({ prompt });
          await new Promise((resolve) => {
            chatFixture.decision = resolve;
          });
          chatFixture.decision = undefined;
          emit({ resolvedPromptId: prompt.id });
        };
        await ask({
          id: "approval",
          kind: "command",
          title: "Approval required",
          description: "cat report.md",
        });
        await ask({
          id: "question",
          kind: "input",
          title: "A question before continuing",
          description: "Choose a period",
          questions: [
            {
              id: "period",
              question: "Which period?",
              options: ["Annual", "Quarterly"],
            },
          ],
        });
        await ask({
          id: "permission",
          kind: "permissions",
          title: "Approval required",
          description: "Allow network access?",
        });
        const final: import("@nomi/core").AgentChatItem = {
          id: "final",
          kind: "message",
          status: "completed",
          title: "Nomi",
          phase: "final_answer",
          text: "**Agent complete.**\n\n```python\nprint('Nomi')\n```\n\n| Result | Status |\n| --- | --- |\n| Local data | Verified |",
        };
        items.push(final);
        emit({ item: final });
        return {
          ok: true,
          value: {
            text: final.text,
            details: { tools: [], citations: [], items, durationMs: 1000 },
          },
        };
      }
      const text = webSearch
        ? "Synthetic streamed reply. Verified fact.citeturn0search0\n\n```python\nprint('Nomi')\n```\n\n| Metric | Value |\n| --- | --- |\n| Coverage | Verified |"
        : "Synthetic streamed reply.";
      const details = {
        tools: [
          {
            id: "ws_fixture",
            type: "search" as const,
            status: "completed" as const,
            query: "Nomi public sources",
          },
        ],
        citations: [
          {
            start: text.indexOf(""),
            end: text.indexOf("") + 1,
            url: "https://www.sec.gov/",
            title: "SEC primary source",
          },
        ],
        durationMs: 2400,
      };
      if (webSearch)
        for (const listener of chatListeners)
          listener({ requestId, text: "", activity: details.tools[0] });
      await new Promise((resolve) => setTimeout(resolve, chatFixture.delay));
      for (const listener of chatListeners) listener({ requestId, text });
      await new Promise((resolve) => setTimeout(resolve, chatFixture.delay));
      return chatFixture.cancelled || chatFixture.failure
        ? { ok: false, error: "Synthetic interrupted response." }
        : { ok: true, value: { text, ...(webSearch ? { details } : {}) } };
    }
    return { ok: true, value: undefined };
  },
};

location.hash = "/research";
createRoot(document.getElementById("root")!).render(
  <React.Profiler
    id="app"
    onRender={() => {
      chatFixture.commits++;
    }}
  >
    <App
      directory={{
        search: async (query) => ({
          scope: "candidates",
          snapshotId: "fixture",
          offset: query.offset,
          total: 0,
          items: [],
        }),
        get: async () => ({ snapshotId: "fixture", item: null }),
      }}
      logos={{ get: async () => null }}
      stockResearch={{ get: async (symbol) => emptyResearch(symbol) }}
    />
  </React.Profiler>,
);
