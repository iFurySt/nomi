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

/** Character BPE for teaching: Unicode code points, whitespace words, no hidden corpus. */
export function bpe(corpus: string, count: number, step: () => void): Value {
  if (
    corpus.length > 1024 ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 32
  )
    return fail("BPE supports up to 1024 characters and 32 merges.");
  if (corpus.includes("</w>"))
    return fail("The word boundary marker is reserved.");
  const words = corpus.trim() ? corpus.trim().split(/\s+/u) : [];
  if (words.length > 128) return fail("Use at most 128 words.");
  // Reserved input marker keeps word boundaries distinct from corpus tokens.
  let sequences = words.map((w) => [...Array.from(w), "</w>"]);
  // Stable teaching IDs: sorted initial alphabet, then each newly learned token.
  // Keep this separate from the frequencies of tokens in the current segmentation.
  const learnedTokens = new Set(sequences.flat().sort());
  const merges: Value[][] = [];
  const pairs = () => {
    const counts = new Map<
      string,
      { left: string; right: string; count: number }
    >();
    for (const word of sequences)
      for (let i = 0; i < word.length - 1; i++) {
        step();
        const left = word[i],
          right = word[i + 1],
          key = JSON.stringify([left, right]);
        const entry = counts.get(key);
        if (entry) entry.count++;
        else counts.set(key, { left, right, count: 1 });
      }
    return [...counts.entries()]
      .sort(
        (a, b) =>
          b[1].count - a[1].count || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
      )
      .map((x) => x[1]);
  };
  const initialTokens = sequences.reduce((n, w) => n + w.length, 0);
  for (let i = 0; i < count; i++) {
    const best = pairs()[0];
    if (!best) break;
    const combined = best.left + best.right;
    learnedTokens.add(combined);
    merges.push([i + 1, best.left, best.right, combined, best.count]);
    sequences = sequences.map((word) => {
      const next: string[] = [];
      for (let j = 0; j < word.length; j++) {
        step();
        if (word[j] === best.left && word[j + 1] === best.right) {
          next.push(combined);
          j++;
        } else next.push(word[j]);
      }
      return next;
    });
  }
  const vocabulary = new Map<string, number>();
  for (const word of sequences)
    for (const token of word) {
      step();
      vocabulary.set(token, (vocabulary.get(token) ?? 0) + 1);
    }
  const tokenCount = sequences.reduce((n, w) => n + w.length, 0);
  const candidates = pairs();
  const best = count < 32 ? candidates[0] : undefined;
  const grouped = new Map<string, { tokens: string[]; count: number }>();
  sequences.forEach((tokens, i) => {
    const row = grouped.get(words[i]);
    if (row) row.count++;
    else grouped.set(words[i], { tokens, count: 1 });
  });
  const segmentationRows: Value[][] = [...grouped].map(([word, row]) => {
    const emphasis: number[] = [];
    const groups: number[][] = [];
    // Highlight exactly the non-overlapping occurrences the next merge replaces.
    if (best)
      for (let i = 0; i < row.tokens.length - 1; i++) {
        if (row.tokens[i] === best.left && row.tokens[i + 1] === best.right) {
          emphasis.push(i, i + 1);
          groups.push([i, i + 1]);
          i++;
        }
      }
    return [word, row.count, { tokens: row.tokens, emphasis, groups }];
  });
  return {
    segmentationRows,
    candidateRows: candidates.map((p, i) => [
      { tokens: [p.left, p.right], joiners: ["+"] },
      p.count,
      i === 0 && best ? "←" : "",
    ]),
    ruleRows: merges.map((m, i) => [
      m[0],
      {
        tokens: [m[1], m[2], m[3]],
        joiners: ["+", "→"],
        emphasis: i === merges.length - 1 ? [2] : [],
      },
      m[4],
    ]),
    vocabularyRows: [...learnedTokens].map((token, id) => [
      id,
      {
        tokens: [token],
        emphasis: merges.length && id === learnedTokens.size - 1 ? [0] : [],
      },
      vocabulary.get(token) ?? 0,
    ]),
    tokenLabel: `词元 ${initialTokens}${merges.length ? ` → ${tokenCount}` : ""}`,
    vocabularyWindow: merges.length ? "end" : "start",
    candidateEmpty: tokenCount ? "已全部合并" : "—",
    nextLabel: best
      ? `合并 ${best.left.replaceAll("</w>", "▁")} + ${best.right.replaceAll("</w>", "▁")}`
      : "已完成",
    nextPairIndex: best ? 0 : -1,
    newTokenIndex: merges.length ? learnedTokens.size - 1 : -1,
    complete: !best,
    atStart: merges.length === 0,
    step: merges.length,
    initialTokens,
    tokenCount,
    merges,
    pairs: candidates.map((p) => [p.left, p.right, p.count]),
    words: sequences.map((w, i) => [words[i], w.join(" · ")]),
    vocabulary: [...vocabulary].sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    ),
    learnedVocabulary: [...learnedTokens].map((token, id) => [
      id,
      token,
      vocabulary.get(token) ?? 0,
    ]),
  };
}

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
