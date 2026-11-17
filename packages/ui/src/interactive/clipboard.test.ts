import { expect, it } from "vitest";
import { temperatureProgram } from "@nomi/core";
import {
  interactiveClipboard,
  readInteractiveClipboard,
  interactiveErrorMessage,
} from "./clipboard";

it("recognizes plain, fenced and legacy block-wrapper DSL without treating ordinary JSON as a block", () => {
  const { text } = interactiveClipboard(temperatureProgram);
  for (const source of [
    text,
    `\`\`\`json\n${text}\n\`\`\``,
    JSON.stringify({
      id: "old-block",
      type: "interactive",
      program: temperatureProgram,
    }),
  ]) {
    expect(readInteractiveClipboard(source)).toEqual(temperatureProgram);
  }
  expect(readInteractiveClipboard('{"text":"hello"}')).toBeNull();
  expect(readInteractiveClipboard("ordinary prose")).toBeNull();
});

it("does not silently downgrade recognized incompatible content to text", () => {
  const future = {
    ...temperatureProgram,
    schema: "nomi-interactive-ir/draft-999",
  };
  expect(() => readInteractiveClipboard(JSON.stringify(future))).toThrow();
  expect(
    interactiveErrorMessage(new Error("Unsupported component: Stepper")),
  ).toContain("请更新 Nomi");
  expect(interactiveErrorMessage(new SyntaxError())).toContain("格式有误");
});

it("escapes markup in the HTML clipboard while preserving portable plain text", () => {
  const program = { ...temperatureProgram, id: "<script>&" };
  const { text, html } = interactiveClipboard(program);
  expect(JSON.parse(text)).toEqual(program);
  expect(html).toContain("&lt;script&gt;&amp;");
  expect(html).not.toContain("<script>");
});
