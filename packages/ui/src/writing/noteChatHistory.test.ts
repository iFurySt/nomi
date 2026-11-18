import { it, expect } from "vitest";
import type { Message } from "@nomi/core";
import { noteChatHistory } from "./noteChatHistory";
const context = { title: "", selected: "", before: "", after: "" };
const pair = (text: string): Message[] => [
  { role: "user", content: "question" },
  { role: "assistant", content: text, source: "chatgpt" },
];
const generated = JSON.stringify({
  reply: "Done",
  commands: [
    {
      type: "add_block",
      block: { id: "a", type: "markdown", source: "A" },
      placement: { id: "p", content: "a", x: 0, y: 0, width: 300, height: 200 },
    },
  ],
});
it("retains the latest generated definition while trimming old conversation pairs", () => {
  const history = [
    ...pair(generated),
    ...pair("x".repeat(32000)),
    ...pair("y".repeat(32000)),
  ];
  const trimmed = noteChatHistory(history, "z".repeat(30000), context);
  expect(trimmed).toEqual([...pair(generated), ...pair("y".repeat(32000))]);
  expect(history).toHaveLength(6);
});
it("accounts for encoded references, host context and message-count limits", () => {
  const longContext = {
    ...context,
    annotations: [
      { id: "a", kind: "text" as const, quote: "\\".repeat(8000), comment: "" },
    ],
  };
  const trimmed = noteChatHistory(
    Array.from({ length: 50 }, () => pair("answer")).flat(),
    "q",
    longContext,
  );
  expect(trimmed.length).toBeLessThan(98);
  expect(trimmed.at(-1)?.role).toBe("assistant");
  const plain = noteChatHistory(pair("x".repeat(32000)), "y".repeat(32000), {
    ...context,
    selected: "\\".repeat(4000),
    before: "\\".repeat(1500),
    after: "\\".repeat(1500),
    annotations: [
      { id: "a", kind: "text", quote: "\\".repeat(16000), comment: "" },
    ],
  });
  expect(plain).toEqual([]);
});
