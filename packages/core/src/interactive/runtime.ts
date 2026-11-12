import { callLearningFunction, learningFunctionArity } from "./functions";
import type {
  Expression,
  InteractiveProgram,
  StudyState,
  Value,
} from "./types";
import { InteractiveError } from "./types";

export function softmax(logits: number[], temperature: number): number[] {
  if (
    !logits.length ||
    logits.length > 64 ||
    !Number.isFinite(temperature) ||
    temperature <= 0 ||
    logits.some((x) => !Number.isFinite(x))
  )
    throw new InteractiveError(
      "domain",
      "Softmax needs finite logits and a positive temperature.",
    );
  // Subtract before dividing to avoid overflow from a large common offset.
  const max = Math.max(...logits);
  const weights = logits.map((x) => Math.exp((x - max) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((x) => x / total);
}
export const interactiveFunctions = [
  "math.softmax",
  "array.at",
  "array.replaceAt",
  ...Object.keys(learningFunctionArity),
] as const;
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validStateValue(
  def: InteractiveProgram["state"][string],
  value: unknown,
): value is Value {
  if (def.type === "string")
    return typeof value === "string" && value.length <= (def.maxLength ?? 1024);
  if (def.type === "number")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= (def.min ?? -Number.MAX_VALUE) &&
      value <= (def.max ?? Number.MAX_VALUE) &&
      (def.step === undefined ||
        Math.abs(
          (value - (def.min ?? 0)) / def.step -
            Math.round((value - (def.min ?? 0)) / def.step),
        ) < 1e-7)
    );
  if (def.type === "enum")
    return typeof value === "string" && !!def.values?.includes(value);
  return (
    Array.isArray(value) &&
    value.length === def.length &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}
export function hydrateStudyState(
  program: InteractiveProgram,
  saved?: unknown,
): StudyState {
  const state: StudyState = Object.create(null);
  for (const [key, def] of Object.entries(program.state))
    state[key] = structuredClone(
      obj(saved) &&
        Object.hasOwn(saved, key) &&
        validStateValue(def, saved[key])
        ? (saved[key] as Value)
        : def.default,
    );
  return state;
}
export function setStudyValue(
  program: InteractiveProgram,
  state: StudyState,
  key: string,
  value: unknown,
): StudyState {
  if (
    !Object.hasOwn(program.state, key) ||
    !validStateValue(program.state[key], value)
  )
    throw new InteractiveError("state", `Invalid value for ${key}.`);
  return { ...state, [key]: structuredClone(value as Value) };
}
export function runStudyAction(
  program: InteractiveProgram,
  state: StudyState,
  action: string,
): StudyState {
  const def = Object.hasOwn(program.actions, action) && program.actions[action];
  if (!def) throw new InteractiveError("reference", "Unknown action.");
  if (def.kind === "set") {
    const value = evaluateProgram(program, state).expression(def.value);
    return setStudyValue(program, state, def.target, value);
  }
  const next = { ...state };
  for (const key of def.targets)
    next[key] = structuredClone(program.state[key].default);
  return next;
}
export function evaluateProgram(
  program: InteractiveProgram,
  state: StudyState,
) {
  let steps = 0;
  const memo = new Map<string, Value>();
  const active = new Set<string>();
  const step = () => {
    if (++steps > Math.min(program.budget.maxStepsPerEvaluation, 100_000))
      throw new InteractiveError("budget", "Calculation budget exceeded.");
  };
  const derived = (id: string): Value => {
    if (memo.has(id)) return memo.get(id)!;
    if (!Object.hasOwn(program.derived, id))
      throw new InteractiveError("reference", `Unknown computation: ${id}`);
    if (active.has(id))
      throw new InteractiveError("cycle", "Cyclic computation.");
    active.add(id);
    try {
      const value = expr(program.derived[id], Object.create(null));
      memo.set(id, value);
      return value;
    } finally {
      active.delete(id);
    }
  };
  const expr = (e: Expression, vars: Record<string, Value>): Value => {
    step();
    switch (e.kind) {
      case "literal":
        return e.value;
      case "state":
        if (
          !Object.hasOwn(state, e.id) ||
          !validStateValue(program.state[e.id], state[e.id])
        )
          throw new InteractiveError(
            "state",
            `Missing or invalid state: ${e.id}`,
          );
        return state[e.id];
      case "variable":
        if (!Object.hasOwn(vars, e.id))
          throw new InteractiveError("reference", "Unbound variable.");
        return vars[e.id];
      case "derived":
        return derived(e.id);
      case "object":
        return Object.fromEntries(
          Object.entries(e.fields).map(([k, v]) => [k, expr(v, vars)]),
        );
      case "match": {
        const key = expr(e.value, vars);
        if (typeof key !== "string" || !Object.hasOwn(e.cases, key))
          throw new InteractiveError("domain", "No matching case.");
        return expr(e.cases[key], vars);
      }
      case "call": {
        const args = e.args.map((a) => expr(a, vars));
        if (e.function === "math.softmax") {
          if (
            !Array.isArray(args[0]) ||
            args[0].some((x) => typeof x !== "number") ||
            typeof args[1] !== "number"
          )
            throw new InteractiveError("domain", "Invalid softmax arguments.");
          return softmax(args[0] as number[], args[1]);
        }
        if (Object.hasOwn(learningFunctionArity, e.function))
          return callLearningFunction(e.function, args, step);
        const [list, index, value] = args;
        if (
          !Array.isArray(list) ||
          list.length > 256 ||
          typeof index !== "number" ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= list.length
        )
          throw new InteractiveError("domain", "Array index out of range.");
        if (e.function === "array.at") return list[index];
        if (e.function === "array.replaceAt") {
          const copy = [...list];
          copy[index] = value;
          return copy;
        }
        throw new InteractiveError("capability", "Unsupported function.");
      }
      case "map": {
        const list = expr(e.items, vars);
        if (!Array.isArray(list) || list.length > 256)
          throw new InteractiveError("budget", "Map needs a bounded list.");
        return list.map((v) => expr(e.body, { ...vars, [e.variable]: v }));
      }
      case "sampleFamily": {
        if (
          e.count > program.budget.maxSamplePointsPerSeries ||
          e.seriesValues.length > program.budget.maxSeries
        )
          throw new InteractiveError("budget", "Sample limit exceeded.");
        return e.seriesValues.map((i) => ({
          series: i,
          points: Array.from({ length: e.count }, (_, j) => {
            const x =
              e.domain[0] + ((e.domain[1] - e.domain[0]) * j) / (e.count - 1);
            const y = expr(e.value, {
              ...vars,
              [e.seriesVariable]: i,
              [e.sampleVariable]: x,
            });
            if (typeof y !== "number" || !Number.isFinite(y))
              throw new InteractiveError(
                "domain",
                "Curve must return finite numbers.",
              );
            return { x, y };
          }),
        }));
      }
    }
  };
  const data = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(data);
    if (obj(v)) {
      if (Object.hasOwn(v, "kind"))
        return expr(v as Expression, Object.create(null));
      return Object.fromEntries(
        Object.entries(v).map(([k, item]) => [k, data(item)]),
      );
    }
    return v;
  };
  return {
    derived,
    expression: (value: Expression) => expr(value, Object.create(null)),
    props: (nodeId: string): Record<string, unknown> => {
      const node = program.nodes.find((n) => n.id === nodeId);
      if (!node) throw new InteractiveError("reference", "Unknown view node.");
      return data(node.props) as Record<string, unknown>;
    },
    get steps() {
      return steps;
    },
  };
}
