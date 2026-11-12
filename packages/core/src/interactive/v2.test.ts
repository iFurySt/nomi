import { describe, it, expect } from "vitest";
import {
  bpeProgram,
  waveProgram,
  parseInteractiveProgram,
  hydrateStudyState,
  setStudyValue,
  runStudyAction,
  evaluateProgram,
} from "./index";
import { bpe, callLearningFunction } from "./functions";
import {
  interactiveGenerationPrefix,
  parseNoteGeneration,
} from "../canvas/generation";
const noop = () => {};
describe("portable learning v2", () => {
  it("trains against independent BPE references, not fixed output", () => {
    expect(bpe("ab ab ac", 1, noop)).toMatchObject({
      initialTokens: 9,
      tokenCount: 7,
      step: 1,
      merges: [[1, "a", "b", "ab", 2]],
    });
    expect(bpe("ab ab ac", 2, noop)).toMatchObject({
      tokenCount: 5,
      merges: [
        [1, "a", "b", "ab", 2],
        [2, "ab", "</w>", "ab</w>", 2],
      ],
    });
    expect(bpe("aaaa", 1, noop)).toMatchObject({
      tokenCount: 3,
      words: [["aaaa", "aa · aa · </w>"]],
    });
    expect(bpe("🙂🙂", 0, noop)).toMatchObject({ initialTokens: 3 });
    expect(bpe("", 32, noop)).toMatchObject({
      initialTokens: 0,
      tokenCount: 0,
      step: 0,
      words: [],
    });
    expect(() => bpe("</w>", 1, noop)).toThrow();
    expect(() => bpe("a ".repeat(129), 1, noop)).toThrow();
    expect(() => bpe("a".repeat(1025), 1, noop)).toThrow();
  });
  it("retains the learned alphabet and merge tokens with stable IDs", () => {
    const result = bpe("ab ab ac", 32, noop) as any;
    expect(result.step).toBe(4);
    expect(result.pairs).toEqual([]);
    expect(result.learnedVocabulary).toEqual([
      [0, "</w>", 0],
      [1, "a", 0],
      [2, "b", 0],
      [3, "c", 0],
      [4, "ab", 0],
      [5, "ab</w>", 2],
      [6, "ac", 0],
      [7, "ac</w>", 1],
    ]);
    expect(result.vocabulary).toEqual([
      ["ab</w>", 2],
      ["ac</w>", 1],
    ]);
    expect(
      (bpe("ab ab ac", 1, noop) as any).learnedVocabulary.map((r: any[]) =>
        r.slice(0, 2),
      ),
    ).toEqual(
      result.learnedVocabulary.slice(0, 5).map((r: any[]) => r.slice(0, 2)),
    );
    expect(bpe("", 32, noop)).toMatchObject({ learnedVocabulary: [] });
    expect((bpe("学习 学习", 1, noop) as any).merges).toEqual([
      [1, "习", "</w>", "习</w>", 2],
    ]);
  });
  it("persists bounded input, steps, clamps and resets independently", () => {
    const p = parseInteractiveProgram(bpeProgram);
    let s = hydrateStudyState(p);
    s = setStudyValue(p, s, "corpus", "ab ab ac");
    s = runStudyAction(p, s, "next");
    expect(evaluateProgram(p, s).derived("training")).toMatchObject({
      tokenCount: 7,
    });
    for (let i = 0; i < 30; i++) s = runStudyAction(p, s, "next");
    expect(s.step).toBe(5); // four actual merges; repeated clicks do not advance indefinitely
    expect(evaluateProgram(p, s).derived("training")).toMatchObject({
      step: 4,
      pairs: [],
    });
    expect(runStudyAction(p, s, "restart")).toEqual({ ...s, step: 0 });
    expect(hydrateStudyState(p, s)).toEqual(s);
    expect(runStudyAction(p, s, "reset")).toEqual(hydrateStudyState(p));
    expect(() => setStudyValue(p, s, "corpus", "x".repeat(1025))).toThrow();
  });
  it("recomputes a generic curve and rejects arithmetic errors", () => {
    const p = parseInteractiveProgram(waveProgram),
      s = hydrateStudyState(p);
    const a = evaluateProgram(p, s).derived("curve") as any;
    const b = evaluateProgram(p, setStudyValue(p, s, "amplitude", 0)).derived(
      "curve",
    ) as any;
    expect(a).not.toEqual(b);
    expect(callLearningFunction("math.sin", [Math.PI / 2], noop)).toBeCloseTo(
      1,
    );
    expect(callLearningFunction("number.format", [-1e-12, 3], noop)).toBe(
      "0.000",
    );
    expect(() => callLearningFunction("math.divide", [1, 0], noop)).toThrow();
    expect(() => callLearningFunction("math.pow", [1e200, 10], noop)).toThrow();
    expect(() =>
      callLearningFunction("object.get", [{}, "constructor"], noop),
    ).toThrow();
  });
  it("enforces version and computation limits", () => {
    const old: any = structuredClone(bpeProgram);
    old.schema = "nomi-interactive-ir/draft-1";
    old.profile = "portable.learning/draft-1";
    expect(() => parseInteractiveProgram(old)).toThrow();
    const p = structuredClone(bpeProgram);
    p.budget.maxStepsPerEvaluation = 10;
    expect(() =>
      evaluateProgram(p, hydrateStudyState(p)).derived("training"),
    ).toThrow(/budget/);
    const s = setStudyValue(
      bpeProgram,
      hydrateStudyState(bpeProgram),
      "corpus",
      "</w>",
    );
    const r = evaluateProgram(bpeProgram, s);
    expect(() => r.derived("training")).toThrow(/reserved/);
    expect(() => r.derived("training")).toThrow(/reserved/); // failed evaluation must not poison cycle detection
  });
});
describe("incremental interactive generation", () => {
  const command = {
    type: "add_block",
    placement: { id: "p", content: "lab", x: 0, y: 0, width: 680, height: 900 },
    block: { id: "lab", type: "interactive", program: bpeProgram },
  };
  const source = JSON.stringify({ commands: [command] });
  it("exposes validated growing subtrees before the interactive command closes", () => {
    const sizes = new Set<number>();
    let first = source.length;
    for (let i = 1; i < source.length; i += 13) {
      const preview = interactiveGenerationPrefix(source.slice(0, i));
      if (!preview) continue;
      const result = parseNoteGeneration(preview, true);
      const block = result.blocks[0];
      if (block.type !== "interactive") throw Error("Wrong block");
      first = Math.min(first, i);
      sizes.add(block.program.nodes.length);
    }
    expect(first).toBeLessThan(source.length * 0.8);
    expect(sizes.size).toBeGreaterThan(4);
    expect(parseNoteGeneration(source).blocks[0]).toMatchObject({
      type: "interactive",
      program: bpeProgram,
    });
  });
  it("never exposes partial strings or undeclared executable content", () => {
    const cut = source.indexOf("BPE ·") + 4;
    const preview = interactiveGenerationPrefix(source.slice(0, cut));
    if (preview) expect(() => parseNoteGeneration(preview, true)).not.toThrow();
    expect(
      interactiveGenerationPrefix('{"commands":[{"__proto__":'),
    ).toBeUndefined();
    expect(
      interactiveGenerationPrefix(
        source.replace('"hostEffects":[]', '"hostEffects":["network"]'),
      ),
    ).toBeUndefined();
  });
});

describe("recorded online generation", () => {
  it("runs the requested sentence lab with candidates and a complete learned vocabulary", async () => {
    const fixture = (await import("./fixtures/generated-bpe-sentence.json"))
      .default;
    const p = parseInteractiveProgram(fixture);
    let state = hydrateStudyState(p);
    state = runStudyAction(p, state, "next");
    expect(evaluateProgram(p, state).derived("training")).toMatchObject({
      step: 1,
      initialTokens: 39,
      tokenCount: 36,
      merges: [[1, "a", "r", "ar", 3]],
    });
    state = setStudyValue(p, state, "corpus", "ab ab ac");
    state = runStudyAction(p, state, "restart");
    expect(state).toMatchObject({ corpus: "ab ab ac", step: 0 });
    for (let i = 0; i < 8; i++) state = runStudyAction(p, state, "next");
    const result = evaluateProgram(p, state).derived("training") as any;
    expect(result).toMatchObject({ step: 4, tokenCount: 3, pairs: [] });
    expect(result.learnedVocabulary).toHaveLength(8);
    // Keep the actual model output wired to the complete vocabulary and candidates.
    expect(JSON.stringify(fixture.nodes)).toContain(
      '"value":"learnedVocabulary"',
    );
    expect(JSON.stringify(fixture.nodes)).toContain('"value":"pairs"');
  });
  it("replays BPE and a revised wave against independent numeric expectations", async () => {
    const bpeFixture = (await import("./fixtures/generated-bpe.json")).default;
    const waveFixture = (await import("./fixtures/generated-wave.json"))
      .default;
    for (const source of [bpeFixture, waveFixture]) {
      const p = parseInteractiveProgram(source);
      expect(p.schema).toBe("nomi-interactive-ir/draft-2");
      expect(p.requires.hostEffects).toEqual([]);
    }
    const p = parseInteractiveProgram(waveFixture);
    let state = hydrateStudyState(p);
    state = setStudyValue(p, state, "frequency", 1.9);
    const r = evaluateProgram(p, state);
    expect(r.derived("displacement")).toBeCloseTo(
      Math.sin(2 * Math.PI * 1.9),
      9,
    );
    expect(r.derived("ballY")).toBeCloseTo(
      110 - 40 * Math.sin(2 * Math.PI * 1.9),
      9,
    );
    expect((r.derived("curve") as any)[0].points).toHaveLength(512);
    expect(runStudyAction(p, state, "reset")).toEqual(hydrateStudyState(p));
  });
});
