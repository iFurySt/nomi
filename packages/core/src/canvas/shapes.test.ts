import { describe, expect, it } from "vitest";
import { canvasShapeOutline, canvasShapePort } from "./shapes";
import { CANVAS_SHAPES } from "./document";

describe("physical shape contours", () => {
  for (const [width, height] of [
    [600, 100],
    [100, 600],
    [16, 16],
    [180, 120],
  ]) {
    for (const rotation of [0, 90, 180, 270] as const) {
      it(`keeps circular 8-unit corners at ${width}×${height}, rotation ${rotation}`, () => {
        const points = canvasShapeOutline(
          "rounded-rectangle",
          { rotation },
          { width, height },
        ).map((p) => ({ x: (p.x * width) / 100, y: (p.y * height) / 100 }));
        const corner = points.filter((p) => p.x <= 8 && p.y <= 8);
        expect(corner.length).toBeGreaterThan(10);
        for (const p of corner)
          expect(Math.hypot(p.x - 8, p.y - 8)).toBeCloseTo(8, 1);
        expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(0);
        expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(width);
      });
    }
  }
  it("keeps capsule ends circular on wide and tall objects", () => {
    for (const [width, height] of [
      [300, 100],
      [100, 300],
    ]) {
      const radius = Math.min(width, height) / 2;
      const points = canvasShapeOutline("stadium", {}, { width, height }).map(
        (p) => ({ x: (p.x * width) / 100, y: (p.y * height) / 100 }),
      );
      for (const p of points.filter((p) => p.x <= radius && p.y <= radius))
        expect(Math.hypot(p.x - radius, p.y - radius)).toBeCloseTo(radius, 1);
    }
  });
  it("all semantic shapes have finite contours and ports after transforms", () => {
    for (const shape of CANVAS_SHAPES)
      for (const rotation of [0, 90, 180, 270] as const) {
        const size = { width: 600, height: 100 },
          style = { rotation, flipX: true };
        const outline = canvasShapeOutline(shape, style, size);
        expect(outline.length).toBeGreaterThan(2);
        for (const p of outline)
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        for (const side of ["n", "e", "s", "w"] as const) {
          const p = canvasShapePort(shape, side, style, size);
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(1);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(1);
        }
      }
  });
  it("uses the entire selection frame for the star", () => {
    const p = canvasShapeOutline("star");
    expect([
      Math.min(...p.map((p) => p.x)),
      Math.min(...p.map((p) => p.y)),
      Math.max(...p.map((p) => p.x)),
      Math.max(...p.map((p) => p.y)),
    ]).toEqual([0, 0, 100, 100]);
  });
});
