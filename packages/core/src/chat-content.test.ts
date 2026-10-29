import { expect, it } from "vitest";
import {
  citedMarkdown,
  safeChatSourceURL,
  validChatReplyDetails,
} from "./chat-content";
it("keeps claims, combines overlapping sources and removes raw citation markup", () => {
  const text = "Verified fact.citeturn0search0 End.";
  const start = text.indexOf(""),
    end = text.indexOf("") + 1;
  const c = { start, end, url: "https://www.sec.gov/", title: "SEC" };
  const rendered = citedMarkdown(text, [
    c,
    { ...c, url: "https://www.nasdaq.com/", title: "Nasdaq" },
  ]);
  expect(rendered).toBe(
    "Verified fact. [1](<https://www.sec.gov/>) [2](<https://www.nasdaq.com/>) End.",
  );
  expect(citedMarkdown("A claim.", [{ ...c, start: 0, end: 7 }])).toBe(
    "A claim [1](<https://www.sec.gov/>).",
  );
  expect(citedMarkdown("Draft.citeunfinished", [])).toBe("Draft.");
});
it("only opens bounded public HTTPS links, with no credentials, local hosts or schemes", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///private/file",
    "http://example.com/",
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://x.local/",
    "https://localhost/",
    "https://localhost./",
    "https://example.lan/",
    "https://a:b@example.com/",
    "https://example.com:8080/",
    "https://example.com/\nsecret",
  ]) {
    expect(safeChatSourceURL(url), url).toBeUndefined();
  }
  expect(safeChatSourceURL("https://www.sec.gov/test?a=1")).toBe(
    "https://www.sec.gov/test?a=1",
  );
});
it("validates persisted display metadata without changing old message storage", () => {
  const d = {
    tools: [
      { id: "ws_one", type: "search", status: "completed", query: "example" },
    ],
    citations: [
      { start: 0, end: 4, url: "https://www.sec.gov/", title: "SEC" },
    ],
    durationMs: 1200,
  };
  expect(validChatReplyDetails(d)).toBe(true);
  expect(validChatReplyDetails({ ...d, durationMs: -1 })).toBe(false);
  expect(
    validChatReplyDetails({
      ...d,
      citations: [{ ...d.citations[0], url: "file:///private" }],
    }),
  ).toBe(false);
  expect(
    validChatReplyDetails({ ...d, tools: Array(25).fill(d.tools[0]) }),
  ).toBe(false);
});

it("preserves already-clickable Markdown citations without adding duplicate badges", () => {
  const text = "A fact. ([sec.gov](https://www.sec.gov/))";
  expect(
    citedMarkdown(text, [
      { start: 8, end: text.length, url: "https://www.sec.gov/", title: "SEC" },
    ]),
  ).toBe(text);
});
