import { describe, it, expect } from "vitest";
import {
  canvasConnectorGeometry,
  canvasPathMidpoint,
  canvasPort,
  type CanvasRect,
  type CanvasSide,
} from "./index";
const sides: CanvasSide[] = ["n", "e", "s", "w"];
const v = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};
const rect = (
  id: string,
  x: number,
  y: number,
  width = 200,
  height = 120,
): CanvasRect => ({
  id,
  content: "shape." + id,
  x,
  y,
  width,
  height,
  shape: "rectangle",
});
describe("shape-aware orthogonal routing", () => {
  it("keeps terminal direction and avoids both endpoint bodies in every port pair", () => {
    for (const [x, y] of [
      [201, 0],
      [220, 0],
      [250, 0],
      [201, 1],
      [201, -1],
      [500, 0],
      [500, 1],
      [500, -1],
      [500, 200],
      [500, -200],
      [-500, 0],
      [-500, 200],
      [0, 350],
      [0, -350],
    ])
      for (const from of sides)
        for (const to of sides) {
          const a = rect("a", 0, 0),
            b = rect("b", x, y),
            path = canvasConnectorGeometry(
              {
                id: "c",
                from: { placement: a.id, side: from },
                to: { placement: b.id, side: to },
                routing: "rounded",
                style: "solid",
                startArrow: false,
                endArrow: true,
                label: "",
              },
              [a, b],
            )!;
          const p = path.points,
            first = p[1],
            last = p.at(-2)!;
          expect(p[0]).toEqual(canvasPort(a, from));
          expect(p.at(-1)).toEqual(canvasPort(b, to));
          expect(
            (first.x - p[0].x) * v[from].x + (first.y - p[0].y) * v[from].y,
          ).toBeGreaterThan(0);
          expect(
            (last.x - p.at(-1)!.x) * v[to].x + (last.y - p.at(-1)!.y) * v[to].y,
          ).toBeGreaterThan(0);
          for (let i = 1; i < p.length; i++) {
            const u = p[i - 1],
              w = p[i];
            expect(u.x === w.x || u.y === w.y).toBe(true);
            for (const r of [a, b]) {
              const crosses =
                u.y === w.y
                  ? u.y > r.y + 1e-8 &&
                    u.y < r.y + r.height - 1e-8 &&
                    Math.max(u.x, w.x) > r.x + 1e-8 &&
                    Math.min(u.x, w.x) < r.x + r.width - 1e-8
                  : u.x > r.x + 1e-8 &&
                    u.x < r.x + r.width - 1e-8 &&
                    Math.max(u.y, w.y) > r.y + 1e-8 &&
                    Math.min(u.y, w.y) < r.y + r.height - 1e-8;
              expect(crosses, JSON.stringify({ from, to, x, y, p, r })).toBe(
                false,
              );
            }
            if (i > 1) {
              const before = p[i - 2];
              expect(
                (u.x - before.x) * (w.x - u.x) + (u.y - before.y) * (w.y - u.y),
              ).toBeGreaterThanOrEqual(0);
            }
          }
        }
  });
  it("goes above a near-level north port and follows resize bounds", () => {
    for (const dy of [-2, -1, 0, 1, 2, 100]) {
      const a = rect("a", 0, 0, 200, 120),
        b = rect("b", 700, 60 + dy, 240, 160),
        path = canvasConnectorGeometry(
          {
            id: "c",
            from: { placement: "a", side: "e" },
            to: { placement: "b", side: "n" },
            routing: "rounded",
            style: "solid",
            startArrow: false,
            endArrow: true,
            label: "",
          },
          [a, b],
        )!;
      expect(path.points.at(-2)!.y).toBeLessThan(b.y - 20);
      expect(path.d).not.toContain("NaN");
    }
  });
  it("positions labels at half total length rather than half segment count", () => {
    expect(
      canvasPathMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 300 },
        { x: 200, y: 300 },
      ]),
    ).toEqual({ x: 100, y: 150 });
  });
});

describe("self-loop outside routing", () => {
  it("keeps every port pair outside the shape for every route kind including coincident ports", () => {
    const r = rect("a", 100, 200, 320, 240);
    for (const routing of ["rounded", "elbow", "curve", "straight"] as const)
      for (const from of sides)
        for (const to of sides) {
          const path = canvasConnectorGeometry(
            {
              id: "c",
              from: { placement: r.id, side: from },
              to: { placement: r.id, side: to },
              routing,
              style: "solid",
              startArrow: false,
              endArrow: true,
              label: "",
            },
            [r],
          )!;
          const p = path.points;
          expect(
            p.length,
            JSON.stringify({ from, to, routing, p }),
          ).toBeGreaterThanOrEqual(4);
          expect(p[0]).toEqual(canvasPort(r, from));
          expect(p.at(-1)).toEqual(canvasPort(r, to));
          expect(
            (p[1].x - p[0].x) * v[from].x + (p[1].y - p[0].y) * v[from].y,
          ).toBeGreaterThan(0);
          const end = p.at(-1)!,
            prior = p.at(-2)!;
          expect(
            (prior.x - end.x) * v[to].x + (prior.y - end.y) * v[to].y,
          ).toBeGreaterThan(0);
          for (let i = 1; i < p.length; i++) {
            const a = p[i - 1],
              b = p[i];
            expect(a.x === b.x || a.y === b.y).toBe(true);
            const crossed =
              a.y === b.y
                ? a.y > r.y + 1e-8 &&
                  a.y < r.y + r.height - 1e-8 &&
                  Math.max(a.x, b.x) > r.x + 1e-8 &&
                  Math.min(a.x, b.x) < r.x + r.width - 1e-8
                : a.x > r.x + 1e-8 &&
                  a.x < r.x + r.width - 1e-8 &&
                  Math.max(a.y, b.y) > r.y + 1e-8 &&
                  Math.min(a.y, b.y) < r.y + r.height - 1e-8;
            expect(crossed, JSON.stringify({ from, to, routing, p })).toBe(
              false,
            );
          }
        }
  });
  it("supports two arbitrary anchors on the same side and near a corner", () => {
    const r = rect("a", 100, 200, 320, 240);
    for (const [from, to] of [
      [
        { placement: r.id, side: "e", anchor: { x: 1, y: 0.25 } },
        { placement: r.id, side: "e", anchor: { x: 1, y: 0.75 } },
      ],
      [
        { placement: r.id, side: "e", anchor: { x: 1, y: 0.99 } },
        { placement: r.id, side: "s", anchor: { x: 0.99, y: 1 } },
      ],
    ] as const) {
      const p = canvasConnectorGeometry(
        {
          id: "c",
          from,
          to,
          routing: "rounded",
          style: "solid",
          startArrow: false,
          endArrow: true,
          label: "",
        },
        [r],
      )!.points;
      expect(Math.max(...p.map((p) => p.x))).toBeGreaterThanOrEqual(460);
      if (to.side === "s")
        expect(Math.max(...p.map((p) => p.y))).toBeGreaterThanOrEqual(480);
    }
  });
});
