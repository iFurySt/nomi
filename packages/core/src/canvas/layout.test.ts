import { describe, it, expect } from "vitest";
import {
  createCanvasDocument,
  parseCanvasDocument,
  applyCanvasCommands,
  canvasArrange,
  canvasTransformSelection,
  canvasShapeTextColor,
  snapCanvasLayout,
  snapCanvasResize,
  canvasShapePort,
  canvasPort,
  resizeCanvasPlacement,
  CANVAS_SHAPES,
  type CanvasRect,
} from "./index";
const rect = (
  id: string,
  x: number,
  y = 0,
  width = 100,
  height = 100,
): CanvasRect => ({
  id,
  content: "shape.test",
  x,
  y,
  width,
  height,
  shape: "rectangle",
});
describe("canvas smart guides and layout", () => {
  it("snaps equal gaps between, before and after neighbors with world-space labels", () => {
    const others = [rect("a", 0), rect("b", 400)];
    const middle = snapCanvasLayout(rect("c", 203), others, 1);
    expect(middle.x).toBe(200);
    expect(middle.guides.filter((g) => g.kind === "gap")).toHaveLength(2);
    expect(middle.guides.find((g) => g.kind === "gap")?.value).toBe(100);
    expect(
      snapCanvasLayout(rect("c", 403), [rect("a", 0), rect("b", 200)], 1).x,
    ).toBe(400);
    expect(
      snapCanvasLayout(rect("c", -197), [rect("a", 0), rect("b", 200)], 1).x,
    ).toBe(-200);
    expect(snapCanvasLayout(rect("c", 207), others, 2).x).toBe(207);
    expect(
      snapCanvasLayout(rect("c", 203, 300), others, 1).guides.some(
        (g) => g.kind === "gap",
      ),
    ).toBe(false);
  });
  it("suppresses redundant center guides when both edges match", () => {
    const result = snapCanvasLayout(rect("a", 0, 2), [rect("b", 200)], 1);
    expect(result.y).toBe(0);
    expect(
      result.guides
        .filter((g) => !g.kind && g.axis === "y")
        .map((g) => g.position),
    ).toEqual([0, 100]);
  });
  it("snaps dragged resize edges and same dimensions without moving the fixed edge", () => {
    const a = rect("a", 0, 0, 200, 200);
    const edge = snapCanvasResize(
      a,
      { ...a, width: 298 },
      "e",
      [rect("b", 300, 400, 100, 100)],
      1,
    );
    expect(edge.rect.x).toBe(0);
    expect(edge.rect.width).toBe(300);
    const size = snapCanvasResize(
      a,
      { ...a, width: 303 },
      "e",
      [rect("b", 1000, 0, 304, 100)],
      1,
    );
    expect(size.rect.width).toBe(304);
    expect(size.guides.every((g) => g.kind === "size")).toBe(true);
    const top = snapCanvasResize(
      a,
      { ...a, y: 98, height: 102 },
      "n",
      [rect("b", 500, 500, 100, 100)],
      1,
    );
    expect(top.rect.y + top.rect.height).toBe(200);
    expect(top.rect.height).toBe(100);
    expect(
      snapCanvasResize(a, { ...a, width: 290 }, "e", [rect("b", 300, 400)], 1)
        .rect.width,
    ).toBe(290);
  });
  it("aligns and distributes variable-size selections atomically, preserving outer edges", () => {
    const rows = [
      rect("a", 0, 0, 100),
      rect("b", 170, 20, 200),
      rect("c", 600, 50, 100),
    ];
    expect(canvasArrange(rows, "horizontal")).toEqual([
      { type: "move", id: "a", x: 0, y: 0 },
      { type: "move", id: "b", x: 250, y: 20 },
      { type: "move", id: "c", x: 600, y: 50 },
    ]);
    expect(
      canvasArrange(rows, "bottom").map((c) => ("y" in c ? c.y : 0)),
    ).toEqual([50, 50, 50]);
    expect(
      canvasArrange(
        rows.map((r, i) => ({ ...r, locked: i === 1 })),
        "left",
      ),
    ).toEqual([]);
    expect(canvasArrange(rows.slice(0, 2), "horizontal")).toEqual([]);
  });
});
describe("platform-neutral shape formatting", () => {
  it("accepts all semantic shapes and bounded styling while preserving old documents", () => {
    const d = createCanvasDocument();
    for (const shape of CANVAS_SHAPES) {
      const next = applyCanvasCommands(d, d.revision, [
        {
          type: "add_block",
          block: {
            id: "shape.test",
            type: "shape",
            shape,
            text: "文本",
            tone: "blue",
            shapeStyle: {
              fill: "none",
              stroke: "#112233",
              strokeWidth: 4,
              strokeStyle: "dotted",
              fillOpacity: 0.5,
              rotation: 90,
              flipX: true,
              text: {
                size: 96,
                bold: true,
                verticalAlign: "top",
                list: "bullet",
                link: "https://example.com",
              },
            },
          },
          placement: {
            id: "place.test",
            content: "shape.test",
            x: 0,
            y: 0,
            width: 30,
            height: 20,
          },
        },
      ]);
      expect(parseCanvasDocument(JSON.stringify(next))).toEqual(next);
    }
    expect(parseCanvasDocument(d)).toEqual(d);
  });
  it("rejects malformed style, lock, group and unsafe links atomically", () => {
    const d = applyCanvasCommands(createCanvasDocument(), 1, [
      {
        type: "add_block",
        block: {
          id: "shape.test",
          type: "shape",
          shape: "rectangle",
          text: "",
          tone: "neutral",
        },
      },
    ]);
    for (const shapeStyle of [
      { fill: "url(x)" },
      { stroke: "red" },
      { fillOpacity: 2 },
      { strokeWidth: 9 },
      { rotation: 45 },
      { text: { link: "javascript:alert(1)" } },
      { text: { size: 97 } },
    ])
      expect(() =>
        applyCanvasCommands(d, d.revision, [
          {
            type: "set_shape",
            block: {
              id: "shape.test",
              type: "shape",
              shape: "rectangle",
              tone: "neutral",
              text: "",
              shapeStyle: shapeStyle as never,
            },
          },
        ]),
      ).toThrow();
    expect(() =>
      applyCanvasCommands(d, d.revision, [
        { type: "set_placement", id: "place.start", group: "__proto__" },
      ]),
    ).toThrow();
    expect(() =>
      applyCanvasCommands(d, d.revision, [
        { type: "set_placement", id: "place.start", locked: "true" as never },
      ]),
    ).toThrow();
  });
  it("changes only placement grouping, locking and layer order", () => {
    const d = createCanvasDocument();
    const next = applyCanvasCommands(d, d.revision, [
      {
        type: "set_placement",
        id: "place.start",
        group: "group.test",
        locked: true,
      },
      { type: "reorder", id: "place.start", position: "forward" },
    ]);
    expect(next.blocks).toEqual(d.blocks);
    expect(next.notes).toEqual(d.notes);
    expect(next.board.placements[1]).toMatchObject({
      id: "place.start",
      locked: true,
      group: "group.test",
    });
    const plain = applyCanvasCommands(next, next.revision, [
      { type: "set_placement", id: "place.start", locked: false, group: null },
    ]);
    expect(
      plain.board.placements.find((p) => p.id === "place.start"),
    ).not.toHaveProperty("group");
  });
  it("keeps polygon anchors on the visible outline after flips and right-angle rotation", () => {
    expect(canvasShapePort("triangle", "e")).toEqual({ x: 0.75, y: 0.5 });
    expect(canvasShapePort("triangle", "w")).toEqual({ x: 0.25, y: 0.5 });
    expect(canvasShapePort("triangle", "e", { rotation: 90 })).toEqual({
      x: 1,
      y: 0.5,
    });
    expect(
      canvasPort({ ...rect("a", 100, 200, 200, 100), shape: "triangle" }, "e"),
    ).toEqual({ x: 250, y: 250 });
    const small = resizeCanvasPlacement(
      rect("a", 100, 200, 200, 100),
      100,
      "nw",
      1000,
      1000,
      { minWidth: 16, minHeight: 16, maxWidth: 1600, maxHeight: 2400 },
    );
    expect(small).toMatchObject({ x: 284, y: 284, width: 16, height: 16 });
  });
  it("rotates and reflects selections around their shared centre", () => {
    const shapes = [rect("a", 0, 0, 100, 100), rect("b", 300, 100, 200, 100)];
    expect(canvasTransformSelection(shapes, "rotate")).toEqual([
      { type: "move", id: "a", x: 250, y: -150 },
      { type: "resize", id: "a", width: 100, height: 100 },
      { type: "move", id: "b", x: 150, y: 150 },
      { type: "resize", id: "b", width: 100, height: 200 },
    ]);
    expect(canvasTransformSelection(shapes, "flip-x")).toEqual([
      { type: "move", id: "a", x: 400, y: 0 },
      { type: "move", id: "b", x: 0, y: 100 },
    ]);
    expect(
      canvasTransformSelection([{ ...shapes[0], locked: true }], "rotate"),
    ).toEqual([]);
  });
  it("anchors fixed curved outlines and chooses legible default ink", () => {
    expect(canvasShapePort("callout", "e").x).toBeLessThan(1);
    const top = canvasShapePort("document", "s");
    expect(top.y).toBeLessThan(1);
    expect(top.y).toBeGreaterThan(0.7);
    expect(canvasShapeTextColor({ fill: "#d9f2e5" })).toBe("#202124");
    expect(canvasShapeTextColor({ fill: "#111111" })).toBe("#ffffff");
    expect(canvasShapeTextColor({ fill: "none" })).toBeUndefined();
    expect(
      canvasShapeTextColor({ fill: "#111111", text: { color: "#123456" } }),
    ).toBe("#123456");
  });
});
