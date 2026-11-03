import { describe, it, expect } from "vitest";
import { parseCanvasGeneration, canvasGenerationCommands } from "./generation";
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
