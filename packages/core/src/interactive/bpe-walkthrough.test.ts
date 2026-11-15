import { describe, expect, it } from "vitest";
import source from "./bpe-guided.json";
import { parseInteractiveProgram, validateResolvedProps } from "./validate";
import {
  evaluateProgram,
  hydrateStudyState,
  runStudyAction,
  setStudyValue,
} from "./runtime";
import { bpeWalkthrough } from "./bpe-walkthrough";
const sentence = "we learn to learn and we love learning";
const at = (s: string, p: number) => bpeWalkthrough(s, p, () => {}) as any;
describe("guided portable BPE", () => {
  it("splits words progressively and distinguishes seen and new characters", () => {
    const first = at(sentence, 1);
    expect(first.phase).toBe("split");
    expect(
      first.vocabulary.flatMap((r: any) => r.tokens.map((t: any) => t.text)),
    ).toEqual(["w", "e", "</w>"]);
    const last = at(sentence, 8);
    const tokens = last.words[7].tokens;
    expect(
      tokens.filter((t: any) => t.tone === "accent").map((t: any) => t.text),
    ).toEqual(["i", "g"]);
    expect(tokens.find((t: any) => t.text === "l").tone).toBe("known");
  });
  it("has discrete merge, record and recount stages with stable backtracking", () => {
    expect(at(sentence, 9).pairs[0][0].tokens).toEqual(["a", "r"]);
    expect(at(sentence, 9).pairs[0][2]).toBe(3);
    expect(at(sentence, 10).phase).toBe("merge");
    expect(at(sentence, 10).progress).toContain("36 词元");
    expect(at(sentence, 11).phase).toBe("record");
    expect(at(sentence, 11).vocabulary.at(-1).tokens[0].text).toBe("ar");
    expect(at(sentence, 12).pairs[0][0].tokens).toEqual(["ar", "n"]);
  });
  it("adds special tokens before numbering, with complete vocabulary and ordered rules", () => {
    const special = at(sentence, 67),
      ids = at(sentence, 68),
      done = at(sentence, 69);
    expect(special.phase).toBe("special");
    expect(ids.phase).toBe("complete");
    expect(ids.complete).toBe(true);
    expect(ids.disabled).toBe(true);
    expect(ids.next).toBe(68);
    expect(ids.previous).toBe(67);
    expect(done).toEqual(ids);
    expect(done.phase).toBe("complete");
    expect(
      special.vocabulary.slice(0, 4).map((r: any) => r.tokens[0].text),
    ).toEqual(["[PAD]", "[UNK]", "[BOS]", "[EOS]"]);
    expect(
      special.vocabulary.every((r: any) => r.tokens[0].number === undefined),
    ).toBe(true);
    expect(ids.vocabulary.map((r: any) => r.tokens[0].number)).toEqual(
      Array.from({ length: 36 }, (_, i) => i),
    );
    expect(done.rules).toHaveLength(19);
    expect(done.next).toBe(68);
  });
  it("executes fast next/back/reset through the actual DSL and validates all phases", () => {
    const program = parseInteractiveProgram(source);
    let state = hydrateStudyState(program);
    for (let i = 0; i < 80; i++) {
      const runtime = evaluateProgram(program, state);
      for (const n of program.nodes)
        validateResolvedProps(n.component, runtime.props(n.id), n.version);
      state = runStudyAction(program, state, "next");
    }
    expect(state.position).toBe(68);
    for (let i = 0; i < 5; i++)
      state = runStudyAction(program, state, "previous");
    expect(state.position).toBe(63);
    state = setStudyValue(program, state, "corpus", "ab ab ac");
    state = runStudyAction(program, state, "restart");
    expect(state).toEqual({ corpus: "ab ab ac", position: 0 });
    expect(at("ab ab ac", 5).progress).toContain("7 词元");
  });
  it("handles empty, Unicode, overlapping pairs and bounds", () => {
    expect(at("", 0).disabled).toBe(true);
    expect(at("😀a 😀a", 4).words[0].tokens.map((t: any) => t.text)).toEqual([
      "😀",
      "a</w>",
    ]);
    expect(at("aaaa", 3).words[0].tokens.map((t: any) => t.text)).toEqual([
      "aa",
      "aa",
      "</w>",
    ]);
    expect(() => at("a</w>", 0)).toThrow();
    expect(() => at("a", 229)).toThrow();
    expect(() => at("x".repeat(601), 0)).toThrow();
  });
  it("rejects unknown actions, unsafe props, invalid token types and undeclared capabilities", () => {
    const bad = structuredClone(source);
    bad.nodes.find((n) => n.id === "navigation")!.props.nextAction = "missing";
    expect(() => parseInteractiveProgram(bad)).toThrow();
    expect(() =>
      validateResolvedProps("TokenFlow", {
        label: "",
        layout: "html",
        rows: [],
      }),
    ).toThrow();
    const old = structuredClone(source);
    old.requires.components.Panel = 1;
    expect(() => parseInteractiveProgram(old)).toThrow();
  });
});
