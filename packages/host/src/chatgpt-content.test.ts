import { expect, it, vi } from "vitest";
import { ChatGPTContent } from "./chatgpt-content";
it("reports only real search events, bounds display data and extracts final citations", () => {
  const emit = vi.fn();
  const content = new ChatGPTContent(emit);
  content.event({
    type: "response.reasoning.delta",
    delta: "private reasoning",
  });
  expect(emit).not.toHaveBeenCalled();
  content.event({
    type: "response.web_search_call.searching",
    item_id: "ws_one",
  });
  content.event({
    type: "response.output_item.done",
    item: {
      id: "ws_one",
      type: "web_search_call",
      status: "completed",
      action: {
        type: "search",
        queries: ["official source"],
        unknown: "ignored",
      },
    },
  });
  const text = "✅ Verified.citeref";
  const chars = Array.from(text);
  content.event({
    type: "response.completed",
    response: {
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text,
              annotations: [
                {
                  type: "url_citation",
                  start_index: chars.indexOf(""),
                  end_index: chars.length,
                  url: "https://www.sec.gov/",
                  title: "SEC",
                },
                {
                  type: "url_citation",
                  start_index: 0,
                  end_index: 4,
                  url: "file:///private",
                  title: "bad",
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const d = content.finish(text, 1400);
  expect(d.tools).toEqual([
    {
      id: "ws_one",
      type: "search",
      status: "completed",
      query: "official source",
    },
  ]);
  expect(d.citations).toEqual([
    {
      start: text.indexOf(""),
      end: text.length,
      url: "https://www.sec.gov/",
      title: "SEC",
    },
  ]);
  expect(JSON.stringify(d)).not.toContain("private reasoning");
  expect(emit).toHaveBeenCalledTimes(2);
});
