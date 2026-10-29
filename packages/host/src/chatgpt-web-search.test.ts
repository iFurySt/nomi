import { expect, it } from "vitest";
import { searchChatGPTWeb } from "./chatgpt-web-search";
it("uses authorized hosted search and returns real cited sources with terminal usage", async () => {
  const frames = [
    { type: "response.web_search_call.searching", item_id: "ws1" },
    { type: "response.output_text.delta", delta: "Verified fact." },
    {
      type: "response.output_item.done",
      item: {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "Verified fact.",
            annotations: [
              {
                type: "url_citation",
                start_index: 0,
                end_index: 14,
                url: "https://www.sec.gov/",
                title: "SEC",
              },
            ],
          },
        ],
      },
    },
    {
      type: "response.completed",
      response: {
        status: "completed",
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
    },
  ];
  const fetcher = (async (url: any, init: any) => {
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers.Authorization).toBe("Bearer synthetic");
    const body = JSON.parse(init.body);
    expect(body.tool_choice).toBe("required");
    expect(body.store).toBe(false);
    return new Response(
      frames.map((f) => "data: " + JSON.stringify(f) + "\n\n").join(""),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }) as typeof fetch;
  const events: any[] = [],
    usage: any[] = [];
  const result = await searchChatGPTWeb(
    "model",
    "SEC",
    "synthetic",
    new AbortController().signal,
    (s) => events.push(s),
    (u) => usage.push(u),
    fetcher,
  );
  expect(events[0].type).toBe("search");
  expect(result.sources[0].url).toBe("https://www.sec.gov/");
  expect(result.summary).toContain("https://www.sec.gov/");
  expect(usage[0].totalTokens).toBe(15);
});
