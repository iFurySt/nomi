import { describe, it, expect } from "vitest";
import {
  drawCanvasRect,
  resizeCanvasPlacement,
  snapCanvasLayout,
  snapCanvasResize,
  CANVAS_SHAPES,
} from "./index";
const limits = { minWidth: 16, minHeight: 16, maxWidth: 1600, maxHeight: 2400 };
describe("shape gesture geometry", () => {
  it("keeps the initial corner fixed in every quadrant, at both size limits", () => {
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const size of [1, 90, 10000]) {
          for (const square of [false, true]) {
            const r = drawCanvasRect(
              { x: 50, y: 60 },
              { x: 50 + x * size, y: 60 + (y * size) / 2 },
              square,
            );
            expect(r.x + (x < 0 ? r.width : 0)).toBe(50);
            expect(r.y + (y < 0 ? r.height : 0)).toBe(60);
            expect(r.width).toBeGreaterThanOrEqual(20);
            expect(r.width).toBeLessThanOrEqual(1600);
            if (square) expect(r.width).toBe(r.height);
          }
        }
  });
  it("preserves resize ratio and opposite corner even when either dimension hits a limit", () => {
    const p = { id: "p", content: "s", x: 100, y: 200, width: 200, height: 80 };
    for (const direction of ["nw", "ne", "sw", "se"] as const)
      for (const delta of [-10000, -30, 50, 10000]) {
        const r = resizeCanvasPlacement(
          p,
          80,
          direction,
          delta,
          delta / 2,
          limits,
          true,
        );
        expect(r.width / r.height!).toBeCloseTo(2.5);
        expect(r.x + (direction.includes("w") ? r.width : 0)).toBeCloseTo(
          direction.includes("w") ? 300 : 100,
        );
        expect(r.y + (direction.includes("n") ? r.height! : 0)).toBeCloseTo(
          direction.includes("n") ? 280 : 200,
        );
        expect(r.width).toBeLessThanOrEqual(1600);
        expect(r.height).toBeGreaterThanOrEqual(16);
      }
  });
  it.each(CANVAS_SHAPES)(
    "%s: edge/center, gaps and size guides use a screen-space threshold at all zooms",
    (shape) => {
      const rect = (id: string, x: number, y = 100) => ({
        id,
        content: id,
        x,
        y,
        width: 100,
        height: 100,
        shape,
      });
      for (const zoom of [0.2, 0.5, 1, 2.5]) {
        const r = snapCanvasLayout(
          rect("c", 200 + 4 / zoom),
          [rect("a", 0), rect("b", 400)],
          zoom,
        );
        expect(r.x).toBe(200);
        expect(r.guides.some((g) => g.kind === "gap")).toBe(true);
        const far = snapCanvasLayout(
          rect("c", 200 + 7 / zoom),
          [rect("a", 0), rect("b", 400)],
          zoom,
        );
        expect(far.x).toBe(200 + 7 / zoom);
        const center = snapCanvasLayout(
          { ...rect("c", 100 + 4 / zoom, 350), width: 300 },
          [{ ...rect("a", 0), width: 500 }],
          zoom,
        );
        expect(center.x).toBe(100);
        const original = rect("c", 200, 300);
        const resized = snapCanvasResize(
          original,
          { ...original, width: 100 - 4 / zoom },
          "e",
          [rect("a", 0)],
          zoom,
        );
        expect(resized.rect.width).toBe(100);
        expect(resized.rect.x).toBe(200);
        expect(resized.guides.some((g) => g.kind === "size")).toBe(true);
      }
    },
  );
});
