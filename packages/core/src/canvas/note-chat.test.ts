import { describe, it, expect } from "vitest";
import { parseNoteChatReply, noteChatPrefix } from "./note-chat";
import { validNoteGenerationContext, validateChatGPTRequest } from "../chatgpt";
const context = { title: "Test", selected: "", before: "", after: "" };
const command = {
  type: "add_block",
  block: { id: "text", type: "markdown", source: "A paragraph." },
  placement: { id: "p", content: "text", x: 0, y: 0, width: 400, height: 200 },
};
describe("note conversation contract", () => {
  it("distinguishes answers from explicit document output", () => {
    expect(
      parseNoteChatReply(
        JSON.stringify({ reply: "An explanation.", commands: [] }),
      ),
    ).toEqual({ reply: "An explanation.", scene: undefined });
    expect(
      parseNoteChatReply(
        JSON.stringify({ reply: "Added.", commands: [command] }),
      ).scene?.blocks[0],
    ).toMatchObject({ type: "markdown", source: "A paragraph." });
  });
  it("rejects unsupported commands, unknown fields and malformed output", () => {
    for (const v of [
      { reply: "x", commands: [], secret: true },
      { reply: "", commands: [] },
      { reply: "x", commands: [{ type: "delete_block", id: "text" }] },
      {
        reply: "x",
        commands: [
          {
            ...command,
            block: {
              id: "text",
              type: "shape",
              shape: "rectangle",
              text: "x",
              tone: "blue",
            },
          },
        ],
      },
    ])
      expect(() => parseNoteChatReply(JSON.stringify(v))).toThrow();
    expect(() => parseNoteChatReply("x".repeat(32001))).toThrow();
  });
  it("streams escaped replies and complete blocks without interpreting command-like text inside the reply", () => {
    const reply = 'A "quote"\nUnicode 你 {"commands":[bad]}';
    const encoded = JSON.stringify({ reply, commands: [command] });
    for (let i = 0; i < encoded.indexOf(',"commands":'); i++)
      expect(noteChatPrefix(encoded.slice(0, i)).preview).toBeUndefined();
    expect(noteChatPrefix(encoded).reply).toBe(reply);
    expect(noteChatPrefix(encoded).preview).toContain("A paragraph.");
    expect(() => noteChatPrefix('{"reply":"\\u')).not.toThrow();
  });
  it("bounds and validates user annotations independently of ordinary chat", () => {
    const annotation = {
      id: "a_1",
      kind: "text",
      quote: "q".repeat(4000),
      comment: "Explain this",
    };
    expect(
      validNoteGenerationContext({ ...context, annotations: [annotation] }),
    ).toBe(true);
    for (const refs of [
      [null],
      [{ ...annotation, extra: true }],
      [annotation, annotation],
      [{ ...annotation, quote: "q".repeat(8001) }],
      [{ ...annotation, comment: "a".repeat(1001) }],
      Array.from({ length: 9 }, (_, i) => ({ ...annotation, id: "a" + i })),
      Array.from({ length: 5 }, (_, i) => ({ ...annotation, id: "a" + i })),
    ])
      expect(
        validNoteGenerationContext({ ...context, annotations: refs }),
      ).toBe(false);
    const request = {
      requestId: "r",
      profileId: "p",
      model: "test",
      messages: [{ role: "user", content: "x".repeat(6000) }],
      generation: "note-chat",
      noteContext: { ...context, annotations: [annotation] },
    };
    expect(() => validateChatGPTRequest(request)).not.toThrow();
    expect(() =>
      validateChatGPTRequest({
        ...request,
        generation: undefined,
        noteContext: undefined,
      }),
    ).toThrow();
    expect(() =>
      validateChatGPTRequest({ ...request, webSearch: true }),
    ).toThrow();
  });
});
