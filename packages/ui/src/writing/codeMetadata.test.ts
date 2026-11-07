import { describe, it, expect } from "vitest";
import { codeFence, codeInfo, parseCodeInfo } from "./codeMetadata";
describe("code fence metadata", () => {
  it("round trips captions, wrap and collapsed without changing code", () => {
    const attrs = {
      language: "ts",
      caption: '示例 "hello"\n第二行',
      wrap: true,
      collapsed: true,
    };
    expect(parseCodeInfo(codeInfo(attrs))).toMatchObject(attrs);
    expect(codeFence({}, "```\ninline ` code")).toBe(
      "````\n```\ninline ` code\n````",
    );
  });
  it("preserves unknown metadata and ordinary fence info", () => {
    const info = 'python linenums nomi={"future":42,"caption":"example"}';
    expect(codeInfo(parseCodeInfo(info))).toBe(info);
    expect(codeInfo(parseCodeInfo("js custom nomi={invalid}"))).toBe(
      "js custom nomi={invalid}",
    );
    expect(codeInfo(parseCodeInfo("js"))).toBe("js");
    expect(codeInfo({ language: null })).toBe("");
  });
  it("keeps automatic language and removes cleared metadata", () => {
    expect(
      parseCodeInfo(codeInfo({ language: null, caption: "sample" })).language,
    ).toBeNull();
    expect(
      codeInfo({
        ...parseCodeInfo('ts nomi={"caption":"old","wrap":true}'),
        caption: "",
        wrap: false,
      }),
    ).toBe("ts");
  });
});
