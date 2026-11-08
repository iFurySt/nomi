import { describe, it, expect } from "vitest";
import {
  parseCanvasGeneration,
  parseNoteGeneration,
  NOTE_INTERACTION_REQUIRED,
  NOTE_INTERACTION_UNSUPPORTED,
  canvasGenerationCommands,
  canvasGenerationPrefix,
} from "./generation";
import { applyCanvasCommands, createCanvasDocument } from "./document";
import { temperatureProgram } from "../interactive";
const block = (id: string, x = 0) => ({
  type: "add_block",
  block: { id, type: "shape", shape: "rectangle", text: id, tone: "blue" },
  placement: { id: "p" + id, content: id, x, y: 0, width: 200, height: 120 },
});
const connection = {
  type: "connect",
  connector: {
    id: "line",
    from: { placement: "pa", side: "e" },
    to: { placement: "pb", side: "w" },
    routing: "rounded",
    style: "solid",
    startArrow: false,
    endArrow: true,
    label: "",
  },
};
const parse = (commands: unknown[]) =>
  parseCanvasGeneration(JSON.stringify({ commands }));
describe("generated canvas scenes", () => {
  it("validates and remaps the whole diagram without touching existing objects", () => {
    const scene = parse([block("a"), block("b", 350), connection]);
    const original = createCanvasDocument();
    const snapshot = JSON.stringify(original);
    const commands = canvasGenerationCommands(scene, { x: 900, y: 100 });
    const next = applyCanvasCommands(original, original.revision, commands);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(next.blocks.length).toBe(original.blocks.length + 2);
    const end = next.board.connectors!.at(-1)!;
    expect(next.board.placements.some((p) => p.id === end.to.placement)).toBe(
      true,
    );
    expect(next.board.placements.at(-2)?.x).toBe(900);
    expect(canvasGenerationCommands(scene, { x: 0, y: 0 })).not.toEqual(
      commands,
    );
  });
  it("accepts portable experiments and rejects unknown capabilities", () => {
    const c = {
      ...block("lab"),
      block: { id: "lab", type: "interactive", program: temperatureProgram },
    };
    expect(parse([c]).blocks[0].type).toBe("interactive");
    expect(() =>
      parse([
        {
          ...c,
          block: {
            ...c.block,
            program: {
              ...temperatureProgram,
              requires: {
                ...temperatureProgram.requires,
                hostEffects: ["network"],
              },
            },
          },
        },
      ]),
    ).toThrow();
  });
  it("rejects edits, external references, missing endpoints, oversized data and scenes", () => {
    for (const commands of [
      [{ type: "remove_placement", id: "a" }],
      [{ ...block("a"), noteId: "private" }],
      [{ ...block("a"), block: { id: "a", type: "file", asset: "private" } }],
      [connection],
      Array.from({ length: 61 }, (_, i) => block(String(i))),
      [block("a", 5000)],
    ])
      expect(() => parse(commands)).toThrow();
    expect(() => parseCanvasGeneration("x".repeat(32001))).toThrow();
    expect(() =>
      parseCanvasGeneration('{"commands":[],"extra":true}'),
    ).toThrow();
  });
});

describe("streamed scene boundaries", () => {
  it("accepts every chunk boundary without exposing incomplete objects", () => {
    const a = block("a"),
      b = block("b", 350);
    a.block.text = 'braces } [ and quote " plus backslash \\';
    const prefix = '{"commands":[';
    const first = JSON.stringify(a);
    const second = JSON.stringify(b);
    const source =
      prefix + first + "," + second + "," + JSON.stringify(connection) + "]}";
    for (let i = 0; i <= source.length; i++) {
      const partial = canvasGenerationPrefix(source.slice(0, i));
      if (i < prefix.length + first.length) expect(partial).toBeUndefined();
      else {
        const scene = parseCanvasGeneration(partial!);
        expect(scene.blocks.length).toBe(
          i < prefix.length + first.length + 1 + second.length ? 1 : 2,
        );
        expect(scene.blocks[0]).toMatchObject({ text: a.block.text });
      }
    }
  });
  it("validates previews and final envelopes independently", () => {
    const text = JSON.stringify({ commands: [block("a")] });
    expect(
      parseCanvasGeneration(canvasGenerationPrefix("```json\n" + text)!).blocks,
    ).toHaveLength(1);
    const invalid = '{"commands":[{"type":"remove_placement","id":"private"}';
    expect(() =>
      parseCanvasGeneration(canvasGenerationPrefix(invalid)!),
    ).toThrow();
    expect(() => canvasGenerationPrefix("x".repeat(32001))).toThrow();
    expect(() =>
      parseCanvasGeneration(text.slice(0, -1) + ',"extra":true}'),
    ).toThrow();
  });
});

describe("native note interactions", () => {
  const intro = {
    ...block("intro"),
    block: { id: "intro", type: "markdown", source: "Explore the result" },
  };
  const lab = {
    ...block("lab"),
    block: { id: "lab", type: "interactive", program: temperatureProgram },
  };
  const response = (commands: unknown[]) => JSON.stringify({ commands });
  it("streams explanations then commits an independently validated interactive block", () => {
    expect(parseNoteGeneration(response([intro]), true).blocks[0].type).toBe(
      "markdown",
    );
    expect(() => parseNoteGeneration(response([intro]))).toThrow(
      NOTE_INTERACTION_REQUIRED,
    );
    const result = parseNoteGeneration(response([intro, lab]));
    expect(result.blocks.map((b) => b.type)).toEqual([
      "markdown",
      "interactive",
    ]);
    expect(result.blocks[1]).toMatchObject({ program: temperatureProgram });
  });
  it("rejects diagrams and inert programs instead of wrapping them in a canvas", () => {
    expect(() =>
      parseNoteGeneration(response([block("a"), block("b"), connection])),
    ).toThrow(NOTE_INTERACTION_REQUIRED);
    const inert = structuredClone(temperatureProgram);
    inert.root = "message";
    inert.nodes = [
      {
        id: "message",
        component: "Text",
        version: 1,
        props: { text: "Only a static explanation" },
      },
    ];
    expect(() =>
      parseNoteGeneration(
        response([{ ...lab, block: { ...lab.block, program: inert } }]),
      ),
    ).toThrow(NOTE_INTERACTION_REQUIRED);
    expect(() =>
      parseNoteGeneration(response([lab, block("a")]), true),
    ).toThrow(NOTE_INTERACTION_REQUIRED);
  });
  it("reports unsupported interactions without relaxing the portable capability boundary", () => {
    expect(() =>
      parseNoteGeneration('{"error":"unsupported_interaction"}'),
    ).toThrow(NOTE_INTERACTION_UNSUPPORTED);
    const invalid = structuredClone(lab);
    invalid.block.program.requires.hostEffects = ["network"] as never;
    expect(() => parseNoteGeneration(response([invalid]))).toThrow();
    expect(() => parseNoteGeneration("x".repeat(32001))).toThrow();
  });
});
