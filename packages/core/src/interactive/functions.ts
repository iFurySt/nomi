import { bpe } from "./bpe";
export { bpe } from "./bpe";
import { bpeWalkthrough } from "./bpe-walkthrough";
import { InteractiveError, type Value } from "./types";

/** Versioned, deterministic operations. No JavaScript source or host effects. */
export const learningFunctionArity: Record<string, number> = {
  "math.add": 2,
  "math.subtract": 2,
  "math.multiply": 2,
  "math.divide": 2,
  "math.pow": 2,
  "math.min": 2,
  "math.max": 2,
  "math.sin": 1,
  "math.cos": 1,
  "number.format": 2,
  "string.concat": 2,
  "object.get": 2,
  "array.length": 1,
  "learning.bpe": 2,
  "learning.bpeWalkthrough": 2,
};
const fail = (message: string): never => {
  throw new InteractiveError("domain", message);
};
const numeric = (v: Value): number =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : fail("Expected a finite number.");
const boundedText = (v: Value, max: number): string =>
  typeof v === "string" && v.length <= max
    ? v
    : fail("Text exceeds the supported limit.");

export function callLearningFunction(
  name: string,
  args: Value[],
  step: () => void,
): Value {
  if (
    !Object.hasOwn(learningFunctionArity, name) ||
    args.length !== learningFunctionArity[name]
  )
    throw new InteractiveError("capability", "Unsupported calculation.");
  if (name === "learning.bpeWalkthrough")
    return bpeWalkthrough(boundedText(args[0], 600), numeric(args[1]), step);
  if (name === "learning.bpe")
    return bpe(boundedText(args[0], 1024), numeric(args[1]), step);
  if (name === "array.length") {
    if (!Array.isArray(args[0]) || args[0].length > 256)
      return fail("Expected a bounded list.");
    return args[0].length;
  }
  if (name === "object.get") {
    const [o, k] = args;
    if (
      !o ||
      Array.isArray(o) ||
      typeof o !== "object" ||
      typeof k !== "string" ||
      !Object.hasOwn(o, k) ||
      ["__proto__", "constructor", "prototype"].includes(k)
    )
      return fail("Unknown data field.");
    return o[k];
  }
  if (name === "string.concat")
    return boundedText(
      boundedText(args[0], 4096) + boundedText(args[1], 4096),
      4096,
    );
  const a = numeric(args[0]);
  if (name === "number.format") {
    const decimals = numeric(args[1]);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8)
      return fail("Invalid decimal precision.");
    const rounded = a.toFixed(decimals);
    return Number(rounded) === 0 ? (0).toFixed(decimals) : rounded;
  }
  const b = args.length > 1 ? numeric(args[1]) : 0;
  const result =
    name === "math.add"
      ? a + b
      : name === "math.subtract"
        ? a - b
        : name === "math.multiply"
          ? a * b
          : name === "math.divide"
            ? a / b
            : name === "math.pow"
              ? a ** b
              : name === "math.min"
                ? Math.min(a, b)
                : name === "math.max"
                  ? Math.max(a, b)
                  : name === "math.sin"
                    ? Math.sin(a)
                    : Math.cos(a);
  return numeric(result);
}
