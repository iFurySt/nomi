import { describe, it, expect } from "vitest";
import {
  compactBpeProgram,
  parseInteractiveProgram,
  hydrateStudyState,
  evaluateProgram,
  runStudyAction,
  validateResolvedProps,
} from "./index";
import { bpe } from "./functions";
describe("compact portable presentation", () => {
  it("declares enhanced versions and rejects downgrade or arbitrary presentation", () => {
    const p = structuredClone(compactBpeProgram);
    p.requires.components.Table = 1;
    expect(() => parseInteractiveProgram(p)).toThrow();
    const q = structuredClone(compactBpeProgram);
    q.nodes.find((n) => n.component === "Table")!.props.css = "display:none";
    expect(() => parseInteractiveProgram(q)).toThrow();
    const r = structuredClone(compactBpeProgram);
    r.nodes.find((n) => n.component === "TextInput")!.props.resetTargets = [
      "missing",
    ];
    expect(() => parseInteractiveProgram(r)).toThrow();
    expect(() =>
      validateResolvedProps(
        "Table",
        { columns: ["x"], rows: [[{ tokens: ["a"], emphasis: [1] }]] },
        2,
      ),
    ).toThrow();
  });
  it("validates semantic groups and rule separators", () => {
    for (const cell of [
      { tokens: ["a", "b"], groups: [[0, 2]] },
      {
        tokens: ["a", "b", "c"],
        groups: [
          [0, 1],
          [1, 2],
        ],
      },
      { tokens: ["a", "b"], joiners: [] },
      { tokens: ["a", "b"], joiners: ["<script>"] },
    ])
      expect(() =>
        validateResolvedProps("Table", { columns: ["x"], rows: [[cell]] }, 2),
      ).toThrow();
    expect(bpe("ab ab ac", 1, () => {})).toMatchObject({
      ruleRows: [
        [
          1,
          { tokens: ["a", "b", "ab"], joiners: ["+", "→"], emphasis: [2] },
          2,
        ],
      ],
    });
    expect(bpe("aaaa", 0, () => {})).toMatchObject({
      segmentationRows: [
        [
          "aaaa",
          1,
          {
            groups: [
              [0, 1],
              [2, 3],
            ],
          },
        ],
      ],
    });
  });
  it("groups repetitions and highlights only actual next replacements", () => {
    expect(bpe("ab ab ac", 0, () => {})).toMatchObject({
      segmentationRows: [
        ["ab", 2, { tokens: ["a", "b", "</w>"], emphasis: [0, 1] }],
        ["ac", 1, { tokens: ["a", "c", "</w>"], emphasis: [] }],
      ],
      nextLabel: "合并 a + b",
      complete: false,
      atStart: true,
    });
    expect(bpe("aaa", 0, () => {})).toMatchObject({
      segmentationRows: [
        ["aaa", 1, { tokens: ["a", "a", "a", "</w>"], emphasis: [0, 1] }],
      ],
    });
    expect(bpe("", 0, () => {})).toMatchObject({
      complete: true,
      atStart: true,
      segmentationRows: [],
    });
  });
  it("evaluates live label, progress and semantic cells across all steps", () => {
    let state = hydrateStudyState(compactBpeProgram);
    for (let i = 0; i <= 32; i++) {
      const runtime = evaluateProgram(compactBpeProgram, state);
      for (const node of compactBpeProgram.nodes)
        validateResolvedProps(
          node.component,
          runtime.props(node.id),
          node.version,
        );
      state = runStudyAction(compactBpeProgram, state, "next");
    }
    expect(
      evaluateProgram(compactBpeProgram, state).props("next").disabled,
    ).toBe(true);
  });
});
