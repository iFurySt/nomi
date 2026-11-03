import { expect, it } from "vitest";
import { createCanvasDocument, parseCanvasDocument } from "./document";
import { validateDrawing, type DrawingBlock } from "./drawing";

const drawing = (): DrawingBlock => ({
  id: "canvas.test",
  type: "drawing",
  width: 960,
  height: 480,
  elements: [
    {
      id: "drawing.one",
      kind: "pen",
      color: "#252525",
      width: 3,
      points: [
        { x: 10, y: 20 },
        { x: 50, y: 80 },
      ],
    },
  ],
});
it("migrates the inline prototype into an isolated native scene without changing the input", () => {
  const d = createCanvasDocument(),
    legacy = { ...drawing(), type: "canvas" };
  const raw = { ...d, blocks: [...d.blocks, legacy] };
  const before = JSON.stringify(raw);
  const migrated = parseCanvasDocument(raw);
  const block = migrated.blocks.at(-1)!;
  expect(JSON.stringify(raw)).toBe(before);
  expect(block).toMatchObject({
    type: "canvas",
    scene: { blocks: [{ type: "drawing", elements: [{ kind: "pen" }] }] },
  });
  expect(parseCanvasDocument(migrated)).toEqual(migrated);
  const boundary = {
    ...legacy,
    width: 1600,
    height: 1200,
    elements: [
      {
        ...legacy.elements[0],
        points: [
          { x: 0, y: 0 },
          { x: 1600, y: 1200 },
        ],
      },
    ],
  };
  expect(() =>
    parseCanvasDocument({ ...d, blocks: [...d.blocks, boundary] }),
  ).not.toThrow();
});
it("bounds drawing geometry, identifiers, styles and data budgets", () => {
  for (const change of [
    { width: NaN },
    { height: 0 },
    { elements: Array(301).fill(drawing().elements[0]) },
    { elements: [{ ...drawing().elements[0], kind: "script" }] },
    {
      elements: [
        { ...drawing().elements[0], color: "url(https://example.com)" },
      ],
    },
    { elements: [{ ...drawing().elements[0], width: 50 }] },
    { elements: [{ ...drawing().elements[0], points: [{ x: -1, y: 0 }] }] },
    { elements: [{ ...drawing().elements[0], points: [{ x: 0, y: 481 }] }] },
    { elements: [{ ...drawing().elements[0], points: [] }] },
    {
      elements: [
        {
          ...drawing().elements[0],
          kind: "rectangle",
          points: [{ x: 0, y: 0 }],
        },
      ],
    },
    {
      elements: [
        { ...drawing().elements[0], points: Array(1025).fill({ x: 1, y: 1 }) },
      ],
    },
    { elements: [drawing().elements[0], drawing().elements[0]] },
    { elements: [{ ...drawing().elements[0], id: "constructor" }] },
  ])
    expect(() =>
      validateDrawing({ ...drawing(), ...change } as DrawingBlock),
    ).toThrow();
  for (const kind of ["pen", "rectangle", "ellipse", "line", "arrow"] as const)
    expect(() =>
      validateDrawing({
        ...drawing(),
        elements: [{ ...drawing().elements[0], kind }],
      }),
    ).not.toThrow();
});
