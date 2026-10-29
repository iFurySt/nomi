import { describe, it, expect } from "vitest";
import reference from "../../../../docs/design-docs/interactive-learning-example/reference-values.json";
import example from "../../../../docs/design-docs/interactive-learning-example/temperature-explorer.nomi-ui.json";
import {
  temperatureProgram as program,
  parseInteractiveProgram,
  evaluateProgram,
  hydrateStudyState,
  setStudyValue,
  runStudyAction,
  softmax,
} from "./index";
const edited = () => structuredClone(program);
const close = (actual: number[], expected: number[]) =>
  actual.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 9));
describe("portable interactive learning", () => {
  it("ships the same program as the reviewed design fixture", () =>
    expect(program).toEqual(example));
  it.each(reference.probabilityCases)(
    "computes independent softmax references at $temperature",
    (c) => close(softmax(c.logits, c.temperature), c.expected),
  );
  it.each(reference.invalidCases)(
    "rejects invalid temperature $temperature",
    (c) => expect(() => softmax(c.logits, c.temperature)).toThrow(),
  );
  it("is stable at extreme finite offsets", () =>
    close(softmax([1e308, 1e308, 1e308], 0.2), [1 / 3, 1 / 3, 1 / 3]));
  it("executes the golden action trace without changing authored defaults", () => {
    let state = hydrateStudyState(program);
    for (const c of reference.eventTrace) {
      const event = c.event;
      state =
        event.type === "set"
          ? setStudyValue(program, state, event.state!, event.value)
          : runStudyAction(
              program,
              state,
              program.nodes.find((n) => n.id === event.node)!.on!.activate,
            );
      expect(state).toEqual(c.expectedState);
      const runtime = evaluateProgram(program, state);
      if (c.expectedProbabilities)
        close(
          runtime.derived("probabilities") as number[],
          c.expectedProbabilities,
        );
      if (c.expectedSeries)
        expect(runtime.derived("activeCurves")).toEqual(
          runtime.derived(c.expectedSeries),
        );
    }
    expect(program.state.temperature.default).toBe(0.85);
  });
  it("samples correct per-token curves and coherent temperature markers", () => {
    let state = hydrateStudyState(program);
    let runtime = evaluateProgram(program, state);
    const curves = runtime.derived("logitCurves") as {
      series: number;
      points: { x: number; y: number }[];
    }[];
    expect(curves).toHaveLength(3);
    expect(curves[0].points).toHaveLength(161);
    for (const c of reference.curveCases) {
      const p = curves[c.series].points.find(
        (p) => Math.abs(p.x - c.x) < 1e-10,
      )!;
      expect(p.y).toBeCloseTo(c.expectedY, 9);
    }
    state = setStudyValue(program, state, "mode", "temperature");
    runtime = evaluateProgram(program, state);
    expect(runtime.derived("temperatureCurves") as unknown[]).toHaveLength(3);
    const markers = runtime.derived("markers") as { x: number; y: number }[];
    expect(markers.every((m) => m.x === 0.85)).toBe(true);
    close(
      markers.map((m) => m.y),
      reference.probabilityCases[1].expected,
    );
  });
  it("retains compatible progress, ignores unknown/invalid fields and isolates immutable updates", () => {
    const saved = {
      temperature: 1.2,
      mode: "unknown",
      logits: [1, 2],
      extra: "ignored",
    };
    const state = hydrateStudyState(program, saved);
    expect(state).toEqual({
      temperature: 1.2,
      mode: "logit",
      logits: [2, 1, 0.1],
    });
    const newer = edited();
    newer.state.temperature.default = 2;
    expect(hydrateStudyState(newer, state).temperature).toBe(1.2);
    const next = setStudyValue(program, state, "logits", [3, 2, 1]);
    (next.logits as number[])[0] = 4;
    expect(state.logits).toEqual([2, 1, 0.1]);
    expect(program.state.logits.default).toEqual([2, 1, 0.1]);
    for (const value of [0, 3.1, 0.855, NaN, Infinity, "1"])
      expect(() =>
        setStudyValue(program, state, "temperature", value),
      ).toThrow();
  });
  it.each([
    [
      "unknown component",
      (p: any) => {
        p.requires.components.WebView = 1;
      },
    ],
    [
      "new version",
      (p: any) => {
        p.requires.functions["math.softmax"] = 2;
      },
    ],
    [
      "host effect",
      (p: any) => {
        p.requires.hostEffects = ["network.fetch"];
      },
    ],
    [
      "missing reference",
      (p: any) => {
        p.derived.probabilities = { kind: "state", id: "missing" };
      },
    ],
    [
      "cycle",
      (p: any) => {
        p.derived.probabilities = { kind: "derived", id: "probabilities" };
      },
    ],
    [
      "unbound variable",
      (p: any) => {
        p.derived.probabilities = { kind: "variable", id: "x" };
      },
    ],
    [
      "sample budget",
      (p: any) => {
        p.derived.logitCurves.count = 100000;
      },
    ],
    [
      "step budget",
      (p: any) => {
        p.budget.maxStepsPerEvaluation = 10;
      },
    ],
    [
      "view cycle",
      (p: any) => {
        p.nodes[0].props.children = [p.root];
      },
    ],
    [
      "duplicate view",
      (p: any) => {
        p.nodes.push(p.nodes[0]);
      },
    ],
    [
      "bad binding",
      (p: any) => {
        p.nodes.find((n: any) => n.component === "Slider").bind.value =
          "logits";
      },
    ],
    [
      "bad default",
      (p: any) => {
        p.state.temperature.default = 0;
      },
    ],
    [
      "arbitrary source",
      (p: any) => {
        p.nodes[0].props.html = "<script/>";
      },
    ],
  ])("rejects %s before a definition can be installed", (_name, mutate) => {
    const p = edited();
    mutate(p);
    expect(() => parseInteractiveProgram(p)).toThrow();
  });
  it("rejects prototype keys, excess bytes, non-JSON and non-finite data", () => {
    expect(() => parseInteractiveProgram('{"__proto__":{}}')).toThrow();
    expect(() => parseInteractiveProgram(" ".repeat(262145))).toThrow();
    const p = edited();
    p.state.temperature.default = Infinity;
    expect(() => parseInteractiveProgram(p)).toThrow();
    expect(() => parseInteractiveProgram(new Date())).toThrow();
  });
  it("enforces runtime quotas for alternate state-dependent branches", () => {
    const p = edited();
    p.budget.maxStepsPerEvaluation = 5000;
    const runtime = evaluateProgram(p, hydrateStudyState(p));
    expect(() => {
      runtime.derived("logitCurves");
      runtime.derived("temperatureCurves");
    }).toThrow(/budget/);
  });
});
