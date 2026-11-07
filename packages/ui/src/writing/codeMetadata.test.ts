import { describe, it, expect } from "vitest";
import {
  codeFence,
  codeInfo,
  parseCodeInfo,
  normalizeCodeHeight,
} from "./codeMetadata";
describe("code fence metadata", () => {
  it("round trips captions, wrap and collapsed without changing code", () => {
    const attrs = {
      language: "ts",
      caption: '示例 "hello"\n第二行',
      wrap: true,
      collapsed: true,
      height: 240,
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
  it("validates viewport height and removes it when returning to auto", () => {
    for (const value of [null, undefined, "200", -1, 0, NaN, Infinity])
      expect(normalizeCodeHeight(value)).toBeNull();
    expect(normalizeCodeHeight(10)).toBe(80);
    expect(normalizeCodeHeight(2000)).toBe(1600);
    expect(
      codeInfo({
        ...parseCodeInfo('js nomi={"height":200,"future":42}'),
        height: null,
      }),
    ).toBe('js nomi={"future":42}');
  });
});
