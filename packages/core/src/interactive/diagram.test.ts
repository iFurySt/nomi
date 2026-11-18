import { describe, it, expect } from "vitest";
import { diagramLayers } from "./diagram";
import {
  bpeDiagramProgram,
  evaluateProgram,
  hydrateStudyState,
  setStudyValue,
  parseInteractiveProgram,
} from "./index";
import {
  parseNoteGeneration,
  interactiveGenerationPrefix,
} from "../canvas/generation";
import generatedDiagram from "./fixtures/generated-bpe-diagram.json";
const response = (program: unknown) =>
  JSON.stringify({
    commands: [
      {
        type: "add_block",
        placement: {
          id: "p",
          content: "diagram",
          x: 0,
          y: 0,
          width: 700,
          height: 600,
        },
        block: { id: "diagram", type: "interactive", program },
      },
    ],
  });
describe("portable diagrams", () => {
  it("keeps a branch and merge in stable topological layers and rejects invalid topology", () => {
    const children = ["corpus", "train", "vocab", "rules", "tokenizer"];
    const edges = [
      { from: "corpus", to: "train" },
      { from: "train", to: "vocab" },
      { from: "train", to: "rules" },
      { from: "vocab", to: "tokenizer" },
      { from: "rules", to: "tokenizer" },
    ];
    expect(diagramLayers(children, edges)).toEqual([
      ["corpus"],
      ["train"],
      ["vocab", "rules"],
      ["tokenizer"],
    ]);
    for (const extra of [
      { from: "tokenizer", to: "corpus" },
      { from: "train", to: "train" },
      { from: "unknown", to: "rules" },
      edges[0],
    ])
      expect(() => diagramLayers(children, [...edges, extra])).toThrow();
    expect(() =>
      diagramLayers(
        Array.from({ length: 17 }, (_, i) => `n${i}`),
        [],
      ),
    ).toThrow();
  });
  it("computes the training output for changed and empty corpora, without tables or playback", () => {
    const program = bpeDiagramProgram;
    expect(
      program.nodes.some((n) => ["Table", "Stepper"].includes(n.component)),
    ).toBe(false);
    let state = setStudyValue(
      program,
      hydrateStudyState(program),
      "corpus",
      "ab ab ac",
    );
    const output = evaluateProgram(program, state);
    const trained = output.derived("training") as any;
    expect(trained.complete).toBe(true);
    expect(trained.merges[0]).toEqual([1, "a", "b", "ab", 2]);
    expect(
      trained.learnedVocabulary.some((row: any) => row[1] === "ab</w>"),
    ).toBe(true);
    expect((output.props("vocabulary").rows as any[]).length).toBe(
      trained.learnedVocabulary.length,
    );
    expect((output.props("rules").rows as any[]).length).toBe(
      trained.merges.length,
    );
    state = setStudyValue(program, state, "corpus", "");
    expect(
      evaluateProgram(program, state).props("rules").rows as any[],
    ).toEqual([]);
  });
  it("validates the actual generated architecture and recomputes its outputs", () => {
    const program = parseInteractiveProgram(generatedDiagram);
    const scene = parseNoteGeneration(response(program));
    expect(scene.blocks).toHaveLength(1);
    const graph = program.nodes.find((n) => n.component === "Diagram")!;
    expect(
      diagramLayers(graph.props.children as string[], graph.props.edges as any),
    ).toHaveLength(4);
    expect(
      program.nodes.some((n) => ["Table", "Stepper"].includes(n.component)),
    ).toBe(false);
    const state = setStudyValue(
      program,
      hydrateStudyState(program),
      "corpus",
      "ab ab ac",
    );
    const evaluated = evaluateProgram(program, state);
    expect((evaluated.derived("training") as any).merges[0]).toEqual([
      1,
      "a",
      "b",
      "ab",
      2,
    ]);
    expect((evaluated.props("rules").rows as any[])[0].tokens[0].text).toBe(
      "a + b → ab",
    );
  });
  it("allows explicit static diagrams in notes without fake input controls", () => {
    const program = structuredClone(bpeDiagramProgram);
    program.nodes = [
      {
        id: "diagram",
        component: "Diagram",
        version: 1,
        props: {
          label: "Architecture",
          children: ["a", "b"],
          edges: [{ from: "a", to: "b" }],
        },
      },
      { id: "a", component: "Text", version: 1, props: { text: "Corpus" } },
      { id: "b", component: "Text", version: 1, props: { text: "Tokenizer" } },
    ];
    program.state = {};
    program.derived = {};
    program.actions = {};
    expect(parseNoteGeneration(response(program)).blocks).toHaveLength(1);
    program.nodes[0].props.edges = [{ from: "a", to: "outside" }];
    expect(() => parseInteractiveProgram(program)).toThrow();
  });
  it("previews only arrived diagram nodes and edges without weakening the final validation", () => {
    const text = response(bpeDiagramProgram);
    const end = text.indexOf(',{"id":"corpusTitle"');
    expect(end).toBeGreaterThan(0);
    const prefix = interactiveGenerationPrefix(text.slice(0, end));
    expect(prefix).toBeTruthy();
    expect(parseNoteGeneration(prefix!, true).blocks[0].type).toBe(
      "interactive",
    );
    expect(parseNoteGeneration(text).blocks[0]).toMatchObject({
      program: bpeDiagramProgram,
    });
  });
});
