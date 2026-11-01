import { describe, it, expect } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  parseCanvasDocument,
  canvasPort,
  canvasConnectorPath,
  snapCanvasRect,
  nearestCanvasEndpoint,
  canvasCrossings,
  canvasConnectorGeometry,
  canvasEndpointPoint,
  reconnectCanvasEndpoint,
  dragCanvasEndpoint,
  canvasBoundaryProjection,
  CANVAS_SHAPES,
  canvasShapeOutline,
  type CanvasEndpoint,
  type CanvasConnector,
  type CanvasRect,
} from "./index";
const rect = (
  id: string,
  x: number,
  y: number,
  width = 200,
  height = 120,
): CanvasRect => ({ id, content: "note.start", x, y, width, height });
const connector: CanvasConnector = {
  id: "connection.test",
  from: { placement: "place.start", side: "e" },
  to: { placement: "place.temperature", side: "w" },
  routing: "curve",
  style: "solid",
  startArrow: false,
  endArrow: true,
  label: "关系",
};
describe("canvas alignment", () => {
  it("snaps edges and centers independently with screen-pixel thresholds", () => {
    const a = rect("a", 103, 302),
      b = rect("b", 100, 300);
    expect(snapCanvasRect(a, [b], 1)).toMatchObject({ x: 100, y: 300 });
    expect(snapCanvasRect(a, [b], 1).guides.map((g) => g.axis)).toEqual([
      "x",
      "x",
      "x",
      "y",
      "y",
      "y",
    ]);
    expect(snapCanvasRect(rect("a", 110, 302), [b], 2).x).toBe(110);
    expect(snapCanvasRect(rect("a", 110, 302), [b], 0.5).x).toBe(100);
    expect(snapCanvasRect(a, [a], 1)).toEqual({ x: 103, y: 302, guides: [] });
  });
  it("finds nearest midpoint or side and skips self and distant objects", () => {
    const r = rect("a", 100, 100);
    expect(canvasPort(r, "e")).toEqual({ x: 300, y: 160 });
    expect(nearestCanvasEndpoint({ x: 310, y: 160 }, [r])).toEqual({
      placement: "a",
      side: "e",
    });
    expect(nearestCanvasEndpoint({ x: 400, y: 160 }, [r])).toBeNull();
    expect(nearestCanvasEndpoint({ x: 300, y: 160 }, [r], "a")).toBeNull();
  });
});
describe("bound canvas connectors and shapes", () => {
  it("round trips connections, styling and shapes while keeping legacy documents unchanged", () => {
    const d = createCanvasDocument();
    expect(parseCanvasDocument(d).board).not.toHaveProperty("connectors");
    const next = applyCanvasCommands(d, d.revision, [
      { type: "connect", connector },
      {
        type: "add_block",
        block: {
          id: "shape.test",
          type: "shape",
          shape: "diamond",
          tone: "sage",
          text: "决策",
        },
        placement: {
          id: "place.shape",
          content: "shape.test",
          x: 200,
          y: 300,
          width: 200,
          height: 160,
        },
      },
    ]);
    const changed = applyCanvasCommands(next, next.revision, [
      {
        type: "update_connector",
        connector: {
          ...connector,
          to: { placement: "place.shape", side: "n" },
          routing: "elbow",
          style: "dashed",
          startArrow: true,
        },
      },
      {
        type: "set_shape",
        block: {
          id: "shape.test",
          type: "shape",
          shape: "ellipse",
          tone: "blue",
          text: "完成",
        },
      },
    ]);
    expect(parseCanvasDocument(JSON.stringify(changed))).toEqual(changed);
    expect(changed.board.connectors![0]).toMatchObject({
      style: "dashed",
      routing: "elbow",
      startArrow: true,
    });
    expect(d.board).not.toHaveProperty("connectors");
  });
  it("binds to placements, tracks geometry, and removes only affected links with a removed placement", () => {
    let d = createCanvasDocument();
    d = applyCanvasCommands(d, d.revision, [
      { type: "connect", connector },
      { type: "duplicate_placement", id: "place.start", newId: "place.copy" },
    ]);
    const start = canvasPort({ ...d.board.placements[0], height: 300 }, "e");
    const moved = applyCanvasCommands(d, d.revision, [
      { type: "move", id: "place.start", x: 80, y: 50 },
      { type: "resize", id: "place.start", width: 500, height: 250 },
    ]);
    expect(
      canvasPort({ ...moved.board.placements[0], height: 250 }, "e"),
    ).not.toEqual(start);
    expect(moved.board.connectors).toEqual(d.board.connectors);
    const removed = applyCanvasCommands(moved, moved.revision, [
      { type: "remove_placement", id: "place.copy" },
    ]);
    expect(removed.board.connectors).toHaveLength(1);
    expect(
      applyCanvasCommands(removed, removed.revision, [
        { type: "remove_placement", id: "place.start" },
      ]).board.connectors,
    ).toEqual([]);
    expect(removed.blocks).toEqual(d.blocks);
  });
  it("rejects dangling/duplicate links, unsafe styles and invalid changes atomically", () => {
    const d = createCanvasDocument(),
      original = JSON.stringify(d);
    const bad = [
      { ...connector, from: { placement: "missing", side: "e" } },
      { ...connector, id: "note.start" },
      { ...connector, label: "x".repeat(201) },
      { ...connector, style: "url(x)" },
      { ...connector, startArrow: "yes" },
      { ...connector, from: { placement: "place.start", side: "evil" } },
    ];
    for (const c of bad)
      expect(() =>
        applyCanvasCommands(d, d.revision, [
          { type: "rename_note", id: "note.start", title: "changed" },
          { type: "connect", connector: c as CanvasConnector },
        ]),
      ).toThrow();
    expect(() =>
      applyCanvasCommands(d, d.revision, [
        { type: "update_connector", connector },
      ]),
    ).toThrow();
    expect(JSON.stringify(d)).toBe(original);
  });
  it.each(["curve", "elbow", "straight"] as const)(
    "builds deterministic %s routes and label anchors",
    (routing) => {
      const a = { x: 0, y: 0 },
        b = { x: 200, y: 100 };
      const result = canvasConnectorPath(a, b, "e", "w", routing);
      expect(result.d.startsWith("M 0 0")).toBe(true);
      expect(result.d.endsWith("200 100")).toBe(true);
      expect(result.d).not.toMatch(/NaN|Infinity/);
      expect(result.label).toEqual({ x: 100, y: 50 });
    },
  );
  it("changes stacking without changing content or reference identities", () => {
    const d = createCanvasDocument(),
      next = applyCanvasCommands(d, d.revision, [
        { type: "reorder", id: "place.start", position: "front" },
      ]);
    expect(next.board.placements.at(-1)!.id).toBe("place.start");
    expect(next.blocks).toEqual(d.blocks);
    expect(
      applyCanvasCommands(next, next.revision, [
        { type: "reorder", id: "place.start", position: "back" },
      ]).board.placements,
    ).toEqual(d.board.placements);
  });
});

describe("connector toolbar protocol", () => {
  it("round trips endpoint marks, free endpoints, line/label styles and bends without losing legacy arrows", () => {
    const d = createCanvasDocument();
    const c: CanvasConnector = {
      ...connector,
      from: { point: { x: 12, y: 30 }, side: "e" },
      routing: "rounded",
      style: "dotted",
      startHead: "circle-open",
      endHead: "crowfoot-bar",
      startArrow: true,
      color: "#4285ff",
      opacity: 0.4,
      width: 4,
      lineJumps: true,
      locked: true,
      waypoints: [
        { x: 80, y: 30 },
        { x: 80, y: 100 },
      ],
      labelStyle: {
        color: "#dd3355",
        size: 24,
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        align: "left",
        link: "https://example.com/notes",
      },
    };
    const next = applyCanvasCommands(d, d.revision, [
      { type: "connect", connector: c },
    ]);
    expect(parseCanvasDocument(JSON.stringify(next)).board.connectors).toEqual([
      c,
    ]);
    expect(
      canvasConnectorPath(
        { x: 0, y: 0 },
        { x: 200, y: 100 },
        "e",
        "w",
        "rounded",
      ).d,
    ).toContain("Q");
    expect(
      canvasConnectorPath({ x: 0, y: 0 }, { x: 200, y: 100 }, "e", "w", "elbow")
        .d,
    ).not.toContain("Q");
  });
  it("rejects unsafe or unbounded toolbar and clipboard values atomically", () => {
    const d = createCanvasDocument();
    for (const patch of [
      { color: "url(https://example.com)" },
      { opacity: -0.1 },
      { opacity: 1.1 },
      { width: 99 },
      { startHead: "javascript" },
      { locked: "yes" },
      { waypoints: [{ x: Infinity, y: 0 }] },
      { waypoints: Array(33).fill({ x: 0, y: 0 }) },
      { from: { point: { x: 0, y: 0 }, placement: "place.start", side: "e" } },
      { labelStyle: { link: "javascript:alert(1)" } },
      { labelStyle: { size: 200 } },
      { labelStyle: { bold: "yes" } },
    ]) {
      expect(() =>
        applyCanvasCommands(d, d.revision, [
          {
            type: "connect",
            connector: { ...connector, ...patch } as CanvasConnector,
          },
        ]),
      ).toThrow();
    }
    expect(d.board.connectors).toBeUndefined();
  });
  it("reorders connectors separately from shapes and restores only their order", () => {
    const d = createCanvasDocument();
    const next = applyCanvasCommands(d, d.revision, [
      { type: "connect", connector },
      { type: "connect", connector: { ...connector, id: "connection.second" } },
      { type: "connect", connector: { ...connector, id: "connection.third" } },
    ]);
    const moved = applyCanvasCommands(next, next.revision, [
      { type: "reorder_connector", id: connector.id, position: "forward" },
    ]);
    expect(moved.board.connectors!.map((c) => c.id)).toEqual([
      "connection.second",
      connector.id,
      "connection.third",
    ]);
    expect(moved.board.placements).toEqual(next.board.placements);
    expect(
      applyCanvasCommands(moved, moved.revision, [
        { type: "reorder_connector", id: connector.id, position: "back" },
      ]).board.connectors,
    ).toEqual(next.board.connectors);
  });
});

it("detects true line crossings and tracks bound endpoints while preserving custom bends", () => {
  expect(
    canvasCrossings(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      [
        [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      ],
    ),
  ).toEqual([{ x: 50, y: 50 }]);
  expect(
    canvasCrossings(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      [
        [
          { x: 100, y: 50 },
          { x: 200, y: 50 },
        ],
      ],
    ),
  ).toEqual([]);
  const c: CanvasConnector = {
    ...connector,
    routing: "rounded",
    waypoints: [
      { x: 400, y: 60 },
      { x: 400, y: 200 },
    ],
  };
  const original = canvasConnectorGeometry(c, [
    rect("place.start", 0, 0),
    rect("place.temperature", 600, 140),
  ])!;
  const moved = canvasConnectorGeometry(c, [
    rect("place.start", 30, 40),
    rect("place.temperature", 600, 140),
  ])!;
  expect(original.points[0]).toEqual({ x: 200, y: 60 });
  expect(moved.points[0]).toEqual({ x: 230, y: 100 });
  expect(moved.points[1]).toEqual({ x: 400, y: 100 });
});

describe("orthogonal port routing", () => {
  it("keeps a visible downward arrival when resizing brings east and north ports almost level", () => {
    const result = canvasConnectorPath(
      { x: 1572.1015625, y: 2247.96484375 },
      { x: 2090, y: 2250 },
      "e",
      "n",
      "rounded",
    );
    expect(result.points.at(-2)).toEqual({ x: 2090, y: 2070 });
    expect(result.points.at(-1)).toEqual({ x: 2090, y: 2250 });
    expect(result.d).toContain("Q");
  });
  it("retains terminal clearance across near-alignment, tiny gaps and all port directions", () => {
    const directions = {
      n: { x: 0, y: -1 },
      e: { x: 1, y: 0 },
      s: { x: 0, y: 1 },
      w: { x: -1, y: 0 },
    };
    const values = [
      -600, -180, -80, -40, -2, -1e-7, 0, 1e-7, 2, 39.999, 40, 40.001, 79.999,
      80, 80.001, 180, 600,
    ];
    for (const x of values)
      for (const y of values)
        for (const fromSide of ["n", "e", "s", "w"] as const)
          for (const toSide of ["n", "e", "s", "w"] as const) {
            const points = canvasConnectorPath(
              { x: 0, y: 0 },
              { x, y },
              fromSide,
              toSide,
              "rounded",
            ).points;
            const first = {
                x: points[1].x - points[0].x,
                y: points[1].y - points[0].y,
              },
              last = {
                x: points.at(-1)!.x - points.at(-2)!.x,
                y: points.at(-1)!.y - points.at(-2)!.y,
              };
            const context = `${x}/${y} ${fromSide}->${toSide}`;
            expect(
              first.x * directions[fromSide].x +
                first.y * directions[fromSide].y,
              context + " departure",
            ).toBeGreaterThanOrEqual(40 - 1e-8);
            expect(
              last.x * directions[toSide].x + last.y * directions[toSide].y,
              context + " arrival",
            ).toBeLessThanOrEqual(-40 + 1e-8);
            for (let i = 1; i < points.length; i++) {
              const a = points[i - 1],
                b = points[i];
              expect(a.x === b.x || a.y === b.y, context + " orthogonal").toBe(
                true,
              );
              expect(
                Math.hypot(b.x - a.x, b.y - a.y),
                context + " nonzero",
              ).toBeGreaterThan(0);
              if (i > 1) {
                const p = points[i - 2];
                expect(
                  (a.x - p.x) * (b.x - a.x) + (a.y - p.y) * (b.y - a.y),
                  context + " reversal",
                ).toBeGreaterThanOrEqual(0);
              }
            }
          }
  });
  it("repairs invalid terminal bends after endpoint resize or movement without rewriting saved bends", () => {
    const waypoints = [
      { x: 300, y: 0 },
      { x: 300, y: -100 },
      { x: 600, y: -100 },
    ];
    const original = structuredClone(waypoints);
    expect(
      canvasConnectorPath(
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        "e",
        "n",
        "rounded",
        waypoints,
      ).points,
    ).toEqual([{ x: 0, y: 0 }, ...waypoints, { x: 600, y: 0 }]);
    // A deliberate, valid short stub from a segment drag remains editable.
    const shortBends = [
      { x: 30, y: 0 },
      { x: 30, y: 34 },
      { x: 90, y: 34 },
      { x: 90, y: 0 },
    ];
    expect(
      canvasConnectorPath(
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        "e",
        "w",
        "rounded",
        shortBends,
      ).points,
    ).toEqual([{ x: 0, y: 0 }, ...shortBends, { x: 120, y: 0 }]);
    for (const [from, to] of [
      [
        { x: 0, y: 0 },
        { x: 600, y: -100 },
      ],
      [
        { x: 0, y: 0 },
        { x: 650, y: -100 },
      ],
      [
        { x: 350, y: 0 },
        { x: 600, y: 0 },
      ],
    ]) {
      const repaired = canvasConnectorPath(
        from,
        to,
        "e",
        "n",
        "rounded",
        waypoints,
      );
      expect(repaired).toEqual(
        canvasConnectorPath(from, to, "e", "n", "rounded"),
      );
    }
    expect(waypoints).toEqual(original);
  });
  it("routes an east-to-north connection above the target then enters downwards, without retracing", () => {
    const result = canvasConnectorPath(
      { x: 0, y: 100 },
      { x: 600, y: 20 },
      "e",
      "n",
      "rounded",
    );
    expect(result.points).toEqual([
      { x: 0, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: -160 },
      { x: 600, y: -160 },
      { x: 600, y: 20 },
    ]);
    expect(result.d).toContain("Q");
  });
  it.each([
    { x: 600, y: 100 },
    { x: -600, y: 100 },
    { x: 100, y: 600 },
    { x: 100, y: -600 },
    { x: 600, y: 0 },
    { x: 0, y: 600 },
  ])(
    "keeps both port directions and avoids overlapping legs for target $x/$y",
    (to) => {
      const directions = {
        n: { x: 0, y: -1 },
        e: { x: 1, y: 0 },
        s: { x: 0, y: 1 },
        w: { x: -1, y: 0 },
      };
      for (const fromSide of ["n", "e", "s", "w"] as const)
        for (const toSide of ["n", "e", "s", "w"] as const) {
          const points = canvasConnectorPath(
            { x: 0, y: 0 },
            to,
            fromSide,
            toSide,
            "rounded",
          ).points;
          const first = {
              x: points[1].x - points[0].x,
              y: points[1].y - points[0].y,
            },
            last = {
              x: points.at(-1)!.x - points.at(-2)!.x,
              y: points.at(-1)!.y - points.at(-2)!.y,
            };
          expect(
            first.x * directions[fromSide].x + first.y * directions[fromSide].y,
            `${fromSide}->${toSide} departure`,
          ).toBeGreaterThan(0);
          expect(
            last.x * directions[toSide].x + last.y * directions[toSide].y,
            `${fromSide}->${toSide} arrival`,
          ).toBeLessThan(0);
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1],
              b = points[i];
            expect(a.x === b.x || a.y === b.y).toBe(true);
            if (i > 1) {
              const p = points[i - 2];
              expect(
                (a.x - p.x) * (b.x - a.x) + (a.y - p.y) * (b.y - a.y),
                `${fromSide}->${toSide} reversal`,
              ).toBeGreaterThanOrEqual(0);
            }
          }
        }
    },
  );
  it("removes collinear control points so a straight segment has just one handle", () => {
    expect(
      canvasConnectorPath({ x: 0, y: 0 }, { x: 600, y: 0 }, "e", "w", "rounded")
        .points,
    ).toEqual([
      { x: 0, y: 0 },
      { x: 600, y: 0 },
    ]);
  });
});

describe("live endpoint reconnection", () => {
  it("keeps the opposite end, arrow meaning and original formatting for both ends", () => {
    const rectangles = [
      rect("place.start", 0, 0),
      rect("place.temperature", 500, 0),
    ];
    const original: CanvasConnector = {
      ...connector,
      routing: "rounded",
      style: "solid",
      color: "#408c5b",
      width: 3,
      opacity: 0.7,
      startHead: "diamond",
      endHead: "triangle",
      waypoints: [
        { x: 240, y: 60 },
        { x: 240, y: -80 },
        { x: 540, y: -80 },
      ],
      labelStyle: { bold: true },
      aboveShapes: true,
    };
    const snapshot = JSON.stringify(original);
    for (const end of ["from", "to"] as const) {
      const next = reconnectCanvasEndpoint(
          original,
          end,
          { x: 350, y: 300 },
          null,
          rectangles,
        ),
        other = end === "from" ? "to" : "from";
      expect(next[other]).toEqual(original[other]);
      expect(next[end]).toEqual({ point: { x: 350, y: 300 }, side: "n" });
      expect(next.waypoints).toEqual([]);
      for (const key of [
        "style",
        "routing",
        "color",
        "width",
        "opacity",
        "startHead",
        "endHead",
        "label",
        "labelStyle",
        "aboveShapes",
      ] as const)
        expect(next[key]).toEqual(original[key]);
      const path = canvasConnectorGeometry(next, rectangles)!;
      expect(end === "from" ? path.points[0] : path.points.at(-1)).toEqual({
        x: 350,
        y: 300,
      });
      expect(end === "from" ? path.points.at(-1) : path.points[0]).toEqual(
        canvasEndpointPoint(original[other], rectangles),
      );
    }
    expect(JSON.stringify(original)).toBe(snapshot);
  });
  it("uses the actual snapped port and does not reverse the connection when moving its start", () => {
    const rectangles = [
      rect("place.start", 0, 0),
      rect("place.temperature", 500, 0),
      rect("place.new", 250, 400),
    ];
    const next = reconnectCanvasEndpoint(
      connector,
      "from",
      { x: 350, y: 401 },
      { placement: "place.new", side: "n" },
      rectangles,
    );
    expect(next.from).toEqual({ placement: "place.new", side: "n" });
    expect(next.to).toEqual(connector.to);
    expect(next.endArrow).toBe(true);
    expect(canvasConnectorGeometry(next, rectangles)!.points[0]).toEqual({
      x: 350,
      y: 400,
    });
  });
});

describe("connector drag stability", () => {
  const rectangles = [rect("a", 100, 200), rect("b", 700, 300, 220, 160)];
  const fixed: CanvasEndpoint = { placement: "a", side: "e" };
  it("holds free heading across diagonal jitter at every zoom and switches after a clear move", () => {
    for (const zoom of [0.5, 1, 2]) {
      let previous: CanvasEndpoint = { point: { x: 500, y: 60 }, side: "w" };
      for (let i = 0; i < 40; i++) {
        previous = dragCanvasEndpoint(
          { x: 500, y: 60 + (i % 2 ? 1 : -1) / zoom },
          fixed,
          rectangles,
          previous,
          zoom,
        );
        expect(previous.side).toBe("w");
      }
      previous = dragCanvasEndpoint(
        { x: 500, y: 60 - 20 / zoom },
        fixed,
        rectangles,
        previous,
        zoom,
      );
      expect(previous.side).toBe("s");
      for (let i = 0; i < 20; i++) {
        previous = dragCanvasEndpoint(
          { x: 500, y: 60 + (i % 2 ? 1 : -1) / zoom },
          fixed,
          rectangles,
          previous,
          zoom,
        );
        expect(previous.side).toBe("s");
      }
      expect(
        dragCanvasEndpoint(
          { x: 500, y: 60 + 20 / zoom },
          fixed,
          rectangles,
          previous,
          zoom,
        ).side,
      ).toBe("w");
    }
  });
  it("uses separate acquire/release bands and can attach again after leaving", () => {
    for (const zoom of [0.5, 1, 2]) {
      let previous = dragCanvasEndpoint(
        { x: 700 - 15 / zoom, y: 380 },
        fixed,
        rectangles,
        null,
        zoom,
      );
      expect(previous).toEqual({ placement: "b", side: "w" });
      for (let i = 0; i < 40; i++) {
        previous = dragCanvasEndpoint(
          { x: 700 - (i % 2 ? 15 : 17) / zoom, y: 380 },
          fixed,
          rectangles,
          previous,
          zoom,
        );
        expect(previous).toEqual({ placement: "b", side: "w" });
      }
      previous = dragCanvasEndpoint(
        { x: 700 - 26 / zoom, y: 380 },
        fixed,
        rectangles,
        previous,
        zoom,
      );
      expect(previous.point).toBeDefined();
      expect(
        dragCanvasEndpoint(
          { x: 700 - 17 / zoom, y: 380 },
          fixed,
          rectangles,
          previous,
          zoom,
        ).point,
      ).toBeDefined();
      expect(
        dragCanvasEndpoint(
          { x: 700 - 15 / zoom, y: 380 },
          fixed,
          rectangles,
          previous,
          zoom,
        ).placement,
      ).toBe("b");
    }
  });
  it("keeps a bound port at the target midline until another is clearly closer", () => {
    for (const zoom of [0.5, 1, 2]) {
      let previous: CanvasEndpoint = { placement: "b", side: "n" };
      for (let i = 0; i < 40; i++) {
        previous = dragCanvasEndpoint(
          { x: 810, y: 380 + (i % 2 ? 1 : -1) / zoom },
          fixed,
          rectangles,
          previous,
          zoom,
        );
        expect(previous).toEqual({ placement: "b", side: "n" });
      }
      expect(
        dragCanvasEndpoint(
          { x: 810, y: 380 + 10 / zoom },
          fixed,
          rectangles,
          previous,
          zoom,
        ),
      ).toEqual({ placement: "b", side: "s" });
    }
    expect(
      dragCanvasEndpoint(
        { x: 200, y: 260 },
        fixed,
        [rect("a", 100, 200)],
        null,
        1,
        false,
      ).placement,
    ).toBeUndefined();
  });
  const original: CanvasConnector = {
    ...connector,
    from: fixed,
    to: { point: { x: 0, y: 260 }, side: "e" },
    routing: "rounded",
  };
  it("retains the same bypass lane under one-pixel jitter for either moving end", () => {
    for (const end of ["from", "to"] as const)
      for (const zoom of [0.5, 1, 2]) {
        const c =
          end === "to"
            ? original
            : { ...original, from: original.to, to: original.from };
        let previous = reconnectCanvasEndpoint(
          c,
          end,
          { x: 0, y: 260 },
          { point: { x: 0, y: 260 }, side: "e" },
          rectangles,
        );
        const initial = canvasConnectorGeometry(previous, rectangles)!;
        const top = Math.min(...initial.points.map((p) => p.y)) < 210;
        for (let i = 0; i < 40; i++) {
          const point = { x: 0, y: 260 + (i % 2 ? 1 : -1) / zoom };
          previous = reconnectCanvasEndpoint(
            c,
            end,
            point,
            { point, side: "e" },
            rectangles,
            { previous, zoom },
          );
          const path = canvasConnectorGeometry(previous, rectangles)!;
          expect(Math.min(...path.points.map((p) => p.y)) < 210).toBe(top);
          expect(end === "to" ? path.points.at(-1) : path.points[0]).toEqual(
            point,
          );
        }
      }
  });
  it("reroutes when the previous lane becomes a large detour and round trips stable bends", () => {
    const previous = reconnectCanvasEndpoint(
      original,
      "to",
      { x: 0, y: 260 },
      original.to,
      rectangles,
    );
    const point = { x: 0, y: 400 };
    const next = reconnectCanvasEndpoint(
      original,
      "to",
      point,
      { point, side: "e" },
      rectangles,
      { previous, zoom: 1 },
    );
    expect(
      Math.min(
        ...canvasConnectorGeometry(next, rectangles)!.points.map((p) => p.y),
      ),
    ).toBeGreaterThanOrEqual(260);
    const stable = reconnectCanvasEndpoint(
      original,
      "to",
      { x: 0, y: 261 },
      { point: { x: 0, y: 261 }, side: "e" },
      rectangles,
      { previous, zoom: 1 },
    );
    expect(stable.waypoints!.length).toBeGreaterThan(0);
    expect(
      canvasConnectorGeometry(JSON.parse(JSON.stringify(stable)), rectangles),
    ).toEqual(canvasConnectorGeometry(stable, rectangles));
    expect(original.waypoints).toBeUndefined();
  });
  it("discards a previous lane that crosses the endpoint shape", () => {
    const bad: CanvasConnector = {
      ...original,
      to: { point: { x: 0, y: 400 }, side: "e" },
      waypoints: [
        { x: 340, y: 260 },
        { x: 340, y: 280 },
        { x: 60, y: 280 },
        { x: 60, y: 400 },
      ],
    };
    const point = { x: 0, y: 401 };
    const next = reconnectCanvasEndpoint(
      original,
      "to",
      point,
      { point, side: "e" },
      rectangles,
      { previous: bad, zoom: 1 },
    );
    expect(next.waypoints).toEqual([]);
  });
});

describe("continuous canvas boundary binding", () => {
  const fixed: CanvasEndpoint = { point: { x: -500, y: 250 }, side: "e" };
  it("binds arbitrary rectangle edges while retaining legacy key ports", () => {
    const r = rect("a", 100, 100, 400, 200);
    for (const [point, side, anchor] of [
      [{ x: 180, y: 98 }, "n", { x: 0.2, y: 0 }],
      [{ x: 502, y: 150 }, "e", { x: 1, y: 0.25 }],
      [{ x: 380, y: 302 }, "s", { x: 0.7, y: 1 }],
      [{ x: 98, y: 240 }, "w", { x: 0, y: 0.7 }],
    ] as const) {
      const endpoint = dragCanvasEndpoint(point, fixed, [r], null, 1);
      expect(endpoint).toEqual({ placement: "a", side, anchor });
      expect(canvasEndpointPoint(endpoint, [r])).toEqual({
        x: 100 + anchor.x * 400,
        y: 100 + anchor.y * 200,
      });
    }
    expect(dragCanvasEndpoint({ x: 103, y: 202 }, fixed, [r], null, 1)).toEqual(
      { placement: "a", side: "w" },
    );
    expect(dragCanvasEndpoint({ x: 300, y: 100 }, fixed, [r], null, 1)).toEqual(
      { placement: "a", side: "n" },
    );
  });
  it("projects onto diamond slopes and ellipse arcs instead of bounding boxes", () => {
    const diamond = {
      ...rect("a", 100, 100, 200, 200),
      shape: "diamond" as const,
    };
    const e = dragCanvasEndpoint({ x: 150, y: 148 }, fixed, [diamond], null, 1);
    expect(e.anchor).toBeDefined();
    const p = canvasEndpointPoint(e, [diamond])!;
    expect(p.x + p.y).toBeCloseTo(300);
    expect(p.x).not.toBe(100);
    const ellipse = { ...diamond, shape: "ellipse" as const };
    const a = dragCanvasEndpoint({ x: 130, y: 130 }, fixed, [ellipse], null, 1),
      q = canvasEndpointPoint(a, [ellipse])!;
    expect(a.anchor).toBeDefined();
    expect((q.x - 200) ** 2 / 10000 + (q.y - 200) ** 2 / 10000).toBeCloseTo(
      1,
      3,
    );
    expect(
      dragCanvasEndpoint({ x: 102, y: 102 }, fixed, [ellipse], null, 1)
        .placement,
    ).toBeUndefined();
  });
  it("uses the rounded corner contour and transformed semantic outlines", () => {
    const r = {
      ...rect("a", 0, 0, 200, 200),
      shape: "rounded-rectangle" as const,
    };
    const e = dragCanvasEndpoint({ x: 1, y: 1 }, fixed, [r], null, 1),
      p = canvasEndpointPoint(e, [r])!;
    expect(p.x).toBeGreaterThan(4);
    expect(p.y).toBeGreaterThan(4);
    const rotated = {
      ...r,
      shape: "triangle" as const,
      shapeStyle: { rotation: 90 as const, flipX: true },
    };
    const hit = canvasBoundaryProjection(rotated, { x: 185, y: 70 });
    expect(canvasBoundaryProjection(rotated, hit.point).distance).toBeLessThan(
      1e-6,
    );
  });
  it("keeps relative edge positions through move, resize and shape changes", () => {
    const r = rect("a", 100, 100, 400, 200),
      endpoint: CanvasEndpoint = {
        placement: "a",
        side: "e",
        anchor: { x: 1, y: 0.25 },
      };
    expect(canvasEndpointPoint(endpoint, [r])).toEqual({ x: 500, y: 150 });
    expect(
      canvasEndpointPoint(endpoint, [
        { ...r, x: 300, y: 400, width: 800, height: 400 },
      ]),
    ).toEqual({ x: 1100, y: 500 });
    const changed = { ...r, shape: "ellipse" as const };
    expect(
      canvasBoundaryProjection(
        changed,
        canvasEndpointPoint(endpoint, [changed])!,
      ).distance,
    ).toBeLessThan(1e-7);
    expect(canvasEndpointPoint({ placement: "a", side: "e" }, [r])).toEqual({
      x: 500,
      y: 200,
    });
  });
  it("retains key attraction/release bands and follows arbitrary edges without key snapping", () => {
    for (const zoom of [0.5, 1, 2]) {
      const r = rect("a", 100, 100, 400 / zoom, 200 / zoom),
        cx = r.x + r.width / 2;
      let e = dragCanvasEndpoint(
        { x: cx + 9 / zoom, y: r.y },
        fixed,
        [r],
        null,
        zoom,
      );
      expect(e.anchor).toBeUndefined();
      e = dragCanvasEndpoint(
        { x: cx + 13 / zoom, y: r.y },
        fixed,
        [r],
        e,
        zoom,
      );
      expect(e.anchor).toBeUndefined();
      e = dragCanvasEndpoint(
        { x: cx + 16 / zoom, y: r.y },
        fixed,
        [r],
        e,
        zoom,
      );
      expect(e.anchor).toBeDefined();
      let last = canvasEndpointPoint(e, [r])!;
      for (let i = 0; i < 40; i++) {
        e = dragCanvasEndpoint(
          { x: cx + (40 + (i % 2)) / zoom, y: r.y + (i % 2 ? 1 : -1) / zoom },
          fixed,
          [r],
          e,
          zoom,
        );
        const p = canvasEndpointPoint(e, [r])!;
        expect(e.side).toBe("n");
        expect(p.y).toBe(r.y);
        if (i)
          expect(Math.abs(p.x - last.x) * zoom).toBeLessThanOrEqual(1.00001);
        last = p;
      }
    }
  });
  it("round trips edge bindings and rejects unsafe or ambiguous anchors atomically", () => {
    const d = createCanvasDocument(),
      c = {
        ...connector,
        to: {
          placement: "place.temperature",
          side: "w" as const,
          anchor: { x: 0, y: 0.25 },
        },
      };
    const next = applyCanvasCommands(d, d.revision, [
      { type: "connect", connector: c },
    ]);
    expect(parseCanvasDocument(JSON.stringify(next))).toEqual(next);
    for (const anchor of [
      { x: -0.1, y: 0.3 },
      { x: 1.1, y: 0 },
      { x: NaN, y: 0 },
      { x: Infinity, y: 0 },
      { x: "0", y: 0 },
      null,
    ]) {
      expect(() =>
        applyCanvasCommands(d, d.revision, [
          {
            type: "connect",
            connector: { ...c, to: { ...c.to, anchor } } as CanvasConnector,
          },
        ]),
      ).toThrow();
    }
    expect(() =>
      applyCanvasCommands(d, d.revision, [
        {
          type: "connect",
          connector: {
            ...c,
            to: { point: { x: 0, y: 0 }, side: "w", anchor: { x: 0, y: 0 } },
          } as never,
        },
      ]),
    ).toThrow();
    expect(d.board.connectors).toBeUndefined();
  });
  it("projects consistently on every fixed shape including flips and quarter rotations", () => {
    for (const shape of CANVAS_SHAPES)
      for (const rotation of [0, 90, 180, 270] as const) {
        const r = {
          ...rect("a", 100, 100, 320, 180),
          shape,
          shapeStyle: { rotation, flipX: true },
        };
        const outline = canvasShapeOutline(shape, r.shapeStyle),
          p = outline[Math.floor(outline.length / 3)];
        const query = {
          x: r.x + (p.x * r.width) / 100,
          y: r.y + (p.y * r.height) / 100,
        };
        const hit = canvasBoundaryProjection(r, query);
        expect(hit.distance, shape).toBeLessThan(1e-7);
        const e = dragCanvasEndpoint(query, fixed, [r], null, 2);
        const resolved = canvasEndpointPoint(e, [r])!;
        expect(
          Number.isFinite(resolved.x) && Number.isFinite(resolved.y),
          shape,
        ).toBe(true);
        expect(
          canvasBoundaryProjection(r, resolved).distance,
          shape,
        ).toBeLessThan(1e-6);
      }
  });
});

describe("self-bound canvas connections", () => {
  const r = rect("a", 100, 100, 320, 240),
    fixed: CanvasEndpoint = { placement: "a", side: "e" };
  it("snaps to its own bottom edge with the actual bottom entry direction", () => {
    const endpoint = dragCanvasEndpoint(
      { x: 365, y: 342 },
      fixed,
      [r],
      null,
      1,
    );
    expect(endpoint.placement).toBe("a");
    expect(endpoint.side).toBe("s");
    expect(canvasEndpointPoint(endpoint, [r])).toEqual({ x: 365, y: 340 });
    const c = {
      ...connector,
      from: fixed,
      to: endpoint,
      routing: "rounded" as const,
    };
    const p = canvasConnectorGeometry(c, [r])!.points;
    expect(p[1].x).toBeGreaterThanOrEqual(460);
    expect(p.at(-2)!.y).toBeGreaterThanOrEqual(380);
    expect(p.at(-2)!.x).toBe(365);
  });
  it("can suppress self capture near the launch point and allow it after arming", () => {
    expect(
      dragCanvasEndpoint({ x: 425, y: 220 }, fixed, [r], null, 1, false).point,
    ).toBeDefined();
    expect(
      dragCanvasEndpoint({ x: 425, y: 220 }, fixed, [r], null, 1, true),
    ).toEqual(fixed);
  });
  it("persists same-placement bindings, follows transforms and removes with its shape", () => {
    const d = createCanvasDocument(),
      id = d.board.placements[0].id;
    const c = {
      ...connector,
      from: { placement: id, side: "e" as const },
      to: { placement: id, side: "s" as const, anchor: { x: 0.83, y: 1 } },
      routing: "rounded" as const,
    };
    const next = applyCanvasCommands(d, d.revision, [
      { type: "connect", connector: c },
    ]);
    expect(parseCanvasDocument(JSON.stringify(next))).toEqual(next);
    const a = { ...r, id },
      b = { ...a, x: 200, y: 300, width: 640, height: 480 };
    const p = canvasConnectorGeometry(c, [a])!,
      q = canvasConnectorGeometry(c, [b])!;
    expect(p.points.at(-1)).toEqual({ x: 365.59999999999997, y: 340 });
    expect(q.points.at(-1)!.x).toBeCloseTo(731.2);
    expect(q.points.at(-1)!.y).toBe(780);
    expect(
      applyCanvasCommands(next, next.revision, [
        { type: "remove_placement", id },
      ]).board.connectors,
    ).toEqual([]);
  });
});
