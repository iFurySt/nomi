import { bpe } from "./bpe";
import { InteractiveError, type Value } from "./types";

type Token = {
  id: string;
  text: string;
  tone: string;
  members: string[];
  number?: number;
};
type Row = { id: string; tokens: Token[] };
const END = "</w>";
const SPECIAL = ["[PAD]", "[UNK]", "[BOS]", "[EOS]"];

/** A bounded teaching timeline. Positions, not elapsed time, determine every result. */
export function bpeWalkthrough(
  corpus: string,
  requested: number,
  tick: () => void,
): Value {
  if (
    corpus.length > 600 ||
    !Number.isInteger(requested) ||
    requested < 0 ||
    requested > 228
  )
    throw new InteractiveError(
      "domain",
      "Use at most 600 characters and a valid lesson position.",
    );
  const words = corpus.trim() ? corpus.trim().split(/\s+/u) : [];
  const base = words.length + 1;
  const desiredRound = Math.min(
    32,
    Math.max(0, Math.ceil((requested - base) / 3)),
  );
  const result = bpe(corpus, desiredRound, tick) as Record<string, any>;
  const round = result.step as number;
  const terminal = base + round * 3;
  const ending = result.complete
    ? Math.max(0, Math.min(2, requested - terminal))
    : 0;
  const position = ending
    ? terminal + ending
    : Math.min(requested, result.complete ? terminal : requested);
  const phase = ending
    ? ["", "special", "complete"][ending]
    : position < base
      ? "split"
      : (position - base) % 3 === 1
        ? "merge"
        : (position - base) % 3 === 2
          ? "record"
          : "pairs";
  const split = Math.min(position, words.length);
  const initial = [...new Set(words.flatMap((w) => [...Array.from(w), END]))];
  const learned = [
    ...new Set([
      ...initial,
      ...result.merges.map((m: Value[]) => String(m[3])),
    ]),
  ];
  const last = result.merges.at(-1) as Value[] | undefined;
  const prior = new Set(
    words
      .slice(0, Math.max(0, split - 1))
      .flatMap((w) => [...Array.from(w), END]),
  );
  const current = new Set(split ? [...Array.from(words[split - 1]), END] : []);
  const token = (
    id: string,
    text: string,
    tone = "normal",
    members = [id],
  ): Token => ({ id, text, tone, members });
  const wordRows: Row[] = words.map((word, wi) => {
    tick();
    const entry = result.segmentationRows.find((r: any[]) => r[0] === word);
    const cell = entry[2];
    let offset = 0;
    const values: string[] =
      phase === "split"
        ? wi < split
          ? [...Array.from(word), END]
          : [word]
        : cell.tokens;
    return {
      id: `word.${wi}`,
      tokens: values.map((text, ti) => {
        const length = text.endsWith(END)
          ? Array.from(text.slice(0, -END.length)).length + 1
          : Array.from(text).length;
        const members = Array.from(
          { length },
          (_, i) => `w${wi}.${offset + i}`,
        );
        offset += length;
        const tone =
          phase === "split"
            ? wi === split - 1
              ? prior.has(text)
                ? "known"
                : "accent"
              : "normal"
            : phase === "pairs" && cell.emphasis.includes(ti)
              ? "accent"
              : phase === "merge" && text === last?.[3]
                ? "accent"
                : "normal";
        return token(members[0], text, tone, members);
      }),
    };
  });
  const visibleLearned =
    phase === "split"
      ? [
          ...new Set(
            words.slice(0, split).flatMap((w) => [...Array.from(w), END]),
          ),
        ]
      : phase === "merge" && last && !initial.includes(String(last[3]))
        ? learned.slice(0, -1)
        : learned;
  const vocabValues = ending
    ? [...SPECIAL, ...learned.filter((t) => !SPECIAL.includes(t))]
    : visibleLearned;
  const vocabRows: Row[] = vocabValues.map((text, i) => ({
    id: `vocab.${text}`,
    tokens: [
      {
        ...token(
          `v.${text}`,
          text,
          ending && SPECIAL.includes(text)
            ? "accent"
            : phase === "split" && current.has(text)
              ? prior.has(text)
                ? "known"
                : "accent"
              : phase === "record" && text === last?.[3]
                ? "accent"
                : "normal",
        ),
        ...(ending >= 2 ? { number: i } : {}),
      },
    ],
  }));
  const ruleRows = result.merges.map((m: Value[]) => [
    { tokens: [m[1], m[2], m[3]], joiners: ["+", "→"] },
    m[0],
  ]);
  const showWords = position > 0 && !ending;
  return {
    position,
    phase,
    round,
    next: words.length ? Math.min(228, position + (ending === 2 ? 0 : 1)) : 0,
    previous: Math.max(0, position - 1),
    atStart: position === 0,
    complete: ending === 2,
    disabled: !words.length || ending === 2,
    checkpoint: phase === "pairs" || ending === 2,
    delay: phase === "record" ? 1400 : 1000,
    title:
      phase === "split"
        ? "逐词拆分"
        : phase === "merge"
          ? "合并"
          : phase === "record"
            ? "记录"
            : "当前拆分",
    progress:
      phase === "split"
        ? `${split} / ${words.length}`
        : `${result.tokenCount} 词元 · 第 ${round} 轮`,
    nextLabel:
      phase === "pairs"
        ? result.complete
          ? "加入特殊词元"
          : result.nextLabel
        : phase === "special"
          ? "分配 ID"
          : phase === "complete"
            ? "完成"
            : "下一步",
    words: wordRows,
    vocabulary: vocabRows,
    vocabularyLabel: `词表 ${vocabRows.length}`,
    vocabularyLayout: ending >= 2 ? "list" : "chips",
    vocabularyHint: ending === 1 ? "Special tokens" : "",
    showWords,
    showPairs: phase === "pairs",
    showVocabulary:
      (phase === "split" && split > 0) || phase === "record" || ending > 0,
    showMerge: phase === "merge" || phase === "record",
    showFinalRules: ending >= 2,
    equation: last
      ? [
          {
            id: `rule.${round}`,
            tokens: [
              token("left", String(last[1])),
              token("plus", "+", "muted"),
              token("right", String(last[2])),
              token("arrow", "→", "muted"),
              token("result", String(last[3]), "accent"),
            ],
          },
        ]
      : [],
    pairs: result.pairs.map((p: Value[], i: number) => [
      { tokens: [p[0], p[1]], joiners: ["+"] },
      i === 0 ? "下一对" : "",
      p[2],
    ]),
    rules: ruleRows,
  };
}
