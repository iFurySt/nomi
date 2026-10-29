import { describe, it, expect } from "vitest";
import {
  canvasConnectorGeometry,
  canvasConnectorPaintGeometry,
  trimCanvasPath,
  type CanvasConnector,
  type CanvasRect,
} from "./index";
const r: CanvasRect = {
  id: "a",
  content: "shape.a",
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  shape: "rectangle",
};
const c: CanvasConnector = {
  id: "c",
  from: { placement: "a", side: "e" },
  to: { point: { x: 500, y: 60 }, side: "w" },
  routing: "straight",
  style: "solid",
  startArrow: false,
  endArrow: true,
  label: "关系",
};
const numbers = (d: string) =>
  d.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)!.map(Number);
describe("connector ink clearance", () => {
  it("trims only bound ink in screen units without changing route, label or bindings", () => {
    const snapshot = JSON.stringify(c),
      logical = canvasConnectorGeometry(c, [r])!;
    for (const zoom of [0.5, 1, 2]) {
      const painted = canvasConnectorPaintGeometry(c, [r], zoom)!,
        n = numbers(painted.d);
      expect((n[0] - 200) * zoom).toBeCloseTo(4.625, 4);
      expect(n.at(-2)).toBeCloseTo(500, 4);
      expect(painted.points).toEqual(logical.points);
      expect(painted.label).toEqual(logical.label);
      expect(JSON.stringify(c)).toBe(snapshot);
    }
    const free = {
      ...c,
      from: { point: { x: 200, y: 60 }, side: "e" as const },
    };
    expect(canvasConnectorPaintGeometry(free, [], 0.5)!.d).toBe(
      canvasConnectorGeometry(free, [])!.d,
    );
  });
  it("preserves quadratic corners and trims both ends of a bound self loop", () => {
    const loop: CanvasConnector = {
      ...c,
      to: { placement: r.id, side: "s", anchor: { x: 0.83, y: 1 } },
      routing: "rounded",
    };
    const logical = canvasConnectorGeometry(loop, [r])!,
      painted = canvasConnectorPaintGeometry(loop, [r])!,
      n = numbers(painted.d);
    expect(painted.d).toContain("Q");
    expect(n[0]).toBeGreaterThan(logical.points[0].x);
    expect(n.at(-1)).toBeGreaterThan(logical.points.at(-1)!.y);
    expect(painted.points).toEqual(logical.points);
  });
  it("retains exact cubic subcurves instead of replacing them with line segments", () => {
    const d = trimCanvasPath("M 0 0 C 0 100 100 100 100 0", 12, 18),
      n = numbers(d);
    expect(d).toContain("C");
    expect(d).not.toContain("L");
    const sample = (p: number[], t: number) => ({
      x:
        (1 - t) ** 3 * p[0] +
        3 * (1 - t) ** 2 * t * p[2] +
        3 * (1 - t) * t * t * p[4] +
        t ** 3 * p[6],
      y:
        (1 - t) ** 3 * p[1] +
        3 * (1 - t) ** 2 * t * p[3] +
        3 * (1 - t) * t * t * p[5] +
        t ** 3 * p[7],
    });
    const original = [0, 0, 0, 100, 100, 100, 100, 0];
    const parameter = (x: number) => {
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (sample(original, mid).x < x) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const start = parameter(n[0]),
      end = parameter(n[6]);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeLessThan(1);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const a = sample(n, t),
        b = sample(original, start + (end - start) * t);
      expect(a.x).toBeCloseTo(b.x, 5);
      expect(a.y).toBeCloseTo(b.y, 5);
    }
  });
  it("walks short terminal segments and keeps a visible finite path for tiny connections", () => {
    const n = numbers(trimCanvasPath("M 0 0 L 2 0 L 2 100", 5, 7));
    expect(n[0]).toBeCloseTo(2, 4);
    expect(n[1]).toBeCloseTo(3, 4);
    expect(n.at(-1)).toBeCloseTo(93, 4);
    const short = numbers(trimCanvasPath("M 0 0 L 4 0", 100, 100));
    expect(short.every(Number.isFinite)).toBe(true);
    expect(short[2] - short[0]).toBeCloseTo(0.8, 4);
  });
  it("accounts for heavy shape borders and line caps on all route kinds", () => {
    const thick = { ...r, shapeStyle: { strokeWidth: 8 } };
    for (const routing of ["straight", "curve", "elbow", "rounded"] as const) {
      const line = { ...c, routing, width: 4 as const },
        painted = canvasConnectorPaintGeometry(line, [thick], 1)!,
        n = numbers(painted.d);
      expect(n[0]).toBeCloseTo(209, 4);
      expect(n[1]).toBeCloseTo(60, 4);
      expect(n.at(-2)).toBeCloseTo(500, 4);
      expect(n.at(-1)).toBeCloseTo(60, 4);
    }
  });
});
