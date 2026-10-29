import type {
  CanvasConnector,
  CanvasEndpoint,
  CanvasSide,
  Placement,
  CanvasPoint,
  CanvasShape,
  CanvasShapeStyle,
} from "./document";
import { canvasShapePort, canvasShapeOutline } from "./shapes";
import { routeBoundCanvasLine } from "./orthogonal";
export type CanvasRect = Placement & {
  height: number;
  shape?: CanvasShape;
  shapeStyle?: CanvasShapeStyle;
};
export interface CanvasGuide {
  axis: "x" | "y";
  position: number;
  from: number;
  to: number;
  kind?: "gap" | "size";
  value?: number;
}
/** Bounds snapping uses a constant screen-pixel radius, independent of zoom. */
export function snapCanvasRect(
  moving: CanvasRect,
  others: CanvasRect[],
  zoom: number,
) {
  const guides: CanvasGuide[] = [];
  let dx = 0,
    dy = 0;
  for (const axis of ["x", "y"] as const) {
    const dimension = axis === "x" ? "width" : "height";
    let best = 6 / zoom + 1e-8;
    let hits: { target: number; other: CanvasRect; delta: number }[] = [];
    for (const other of others) {
      if (other.id === moving.id) continue;
      for (const factor of [0, 0.5, 1])
        for (const targetFactor of [0, 0.5, 1]) {
          const target = other[axis] + other[dimension] * targetFactor;
          const delta = target - moving[axis] - moving[dimension] * factor;
          if (Math.abs(delta) < best - 1e-8) {
            best = Math.abs(delta);
            hits = [{ target, other, delta }];
          } else if (
            Math.abs(Math.abs(delta) - best) < 1e-8 &&
            hits.length &&
            Math.abs(delta - hits[0].delta) < 1e-8
          )
            hits.push({ target, other, delta });
        }
    }
    if (!hits.length) continue;
    const delta = hits[0].delta;
    if (axis === "x") dx = delta;
    else dy = delta;
    const cross = axis === "x" ? "y" : "x",
      size = axis === "x" ? "height" : "width";
    for (const target of new Set(hits.map((h) => h.target))) {
      const aligned = hits
        .filter((h) => h.target === target)
        .map((h) => h.other);
      guides.push({
        axis,
        position: target,
        from:
          Math.min(moving[cross], ...aligned.map((r) => r[cross])) - 16 / zoom,
        to:
          Math.max(
            moving[cross] + moving[size],
            ...aligned.map((r) => r[cross] + r[size]),
          ) +
          16 / zoom,
      });
    }
  }
  return { x: moving.x + dx, y: moving.y + dy, guides };
}
export function canvasPort(rect: CanvasRect, side: CanvasSide) {
  if (rect.shape) {
    const p = canvasShapePort(rect.shape, side, rect.shapeStyle);
    return { x: rect.x + p.x * rect.width, y: rect.y + p.y * rect.height };
  }
  return {
    x: rect.x + rect.width * (side === "e" ? 1 : side === "w" ? 0 : 0.5),
    y: rect.y + rect.height * (side === "s" ? 1 : side === "n" ? 0 : 0.5),
  };
}
/** Closest point on the rendered semantic contour in world units. */
export function canvasBoundaryProjection(
  rect: CanvasRect,
  point: CanvasPoint,
  preferredSide?: CanvasSide,
  switchMargin = 0,
) {
  const outline = (
    rect.shape
      ? canvasShapeOutline(rect.shape, rect.shapeStyle)
      : [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ]
  ).map((p) => ({
    x: rect.x + (p.x * rect.width) / 100,
    y: rect.y + (p.y * rect.height) / 100,
  }));
  const area = outline.reduce((sum, a, i) => {
    const b = outline[(i + 1) % outline.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0);
  let inside = false;
  const candidates: {
    point: CanvasPoint;
    side: CanvasSide;
    distance: number;
  }[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i],
      b = outline[(i + 1) % outline.length],
      dx = b.x - a.x,
      dy = b.y - a.y;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < a.x + ((point.y - a.y) * dx) / dy
    )
      inside = !inside;
    const length = dx * dx + dy * dy;
    if (length < 1e-16) continue;
    const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
      ),
      p = { x: a.x + dx * t, y: a.y + dy * t },
      nx = (area >= 0 ? 1 : -1) * dy,
      ny = (area >= 0 ? -1 : 1) * dx;
    const side: CanvasSide =
      Math.abs(nx) >= Math.abs(ny)
        ? nx >= 0
          ? "e"
          : "w"
        : ny >= 0
          ? "s"
          : "n";
    candidates.push({
      point: p,
      side,
      distance: Math.hypot(point.x - p.x, point.y - p.y),
    });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0],
    held = candidates.find((c) => c.side === preferredSide);
  return {
    ...(held && held.distance <= best.distance + switchMargin ? held : best),
    inside,
  };
}
function boundaryCanvasEndpoint(
  point: CanvasPoint,
  rect: CanvasRect,
  zoom: number,
  previous: CanvasEndpoint | null = null,
): CanvasEndpoint {
  const keys = (["n", "e", "s", "w"] as CanvasSide[])
    .map((side) => {
      const p = canvasPort(rect, side);
      return { side, distance: Math.hypot(point.x - p.x, point.y - p.y) };
    })
    .sort((a, b) => a.distance - b.distance);
  const held =
    previous?.placement === rect.id && !previous.anchor
      ? keys.find((k) => k.side === previous.side)
      : undefined;
  const key =
    held && held.distance <= 14 / zoom
      ? held
      : keys[0].distance <= 10 / zoom
        ? keys[0]
        : null;
  if (key) return { placement: rect.id, side: key.side };
  const hit = canvasBoundaryProjection(
    rect,
    point,
    previous?.placement === rect.id ? previous.side : undefined,
    12 / zoom,
  );
  // Keep the legacy form when a projection lands exactly on a cardinal port.
  const port = canvasPort(rect, hit.side);
  if (Math.hypot(hit.point.x - port.x, hit.point.y - port.y) < 1e-7)
    return { placement: rect.id, side: hit.side };
  return {
    placement: rect.id,
    side: hit.side,
    anchor: {
      x: Math.max(0, Math.min(1, (hit.point.x - rect.x) / rect.width)),
      y: Math.max(0, Math.min(1, (hit.point.y - rect.y) / rect.height)),
    },
  };
}
export function nearestCanvasEndpoint(
  point: CanvasPoint,
  rectangles: CanvasRect[],
  excluded?: string,
  threshold = 20,
): CanvasEndpoint | null {
  for (const rect of [...rectangles].reverse()) {
    if (
      rect.id === excluded ||
      point.x < rect.x - threshold ||
      point.x > rect.x + rect.width + threshold ||
      point.y < rect.y - threshold ||
      point.y > rect.y + rect.height + threshold
    )
      continue;
    const hit = canvasBoundaryProjection(rect, point);
    if (hit.inside || hit.distance <= threshold)
      return boundaryCanvasEndpoint(point, rect, 1);
  }
  return null;
}
const direction = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};
/** Gesture-local hysteresis. The pointer's world position is authoritative:
 * rendered ports/lines must not change the next hit test under pointer capture. */
export function dragCanvasEndpoint(
  point: CanvasPoint,
  fixed: CanvasEndpoint,
  rectangles: CanvasRect[],
  previous: CanvasEndpoint | null,
  zoom: number,
  allowSelf = true,
): CanvasEndpoint {
  const acquire = 16 / zoom,
    release = 24 / zoom,
    switchMargin = 12 / zoom;
  const contains = (r: CanvasRect, margin: number) => {
    if (
      point.x < r.x - margin ||
      point.x > r.x + r.width + margin ||
      point.y < r.y - margin ||
      point.y > r.y + r.height + margin
    )
      return false;
    const hit = canvasBoundaryProjection(r, point);
    return hit.inside || hit.distance <= margin;
  };
  const held = rectangles.find(
    (r) =>
      r.id === previous?.placement && (allowSelf || r.id !== fixed.placement),
  );
  const target =
    held && contains(held, release)
      ? held
      : [...rectangles]
          .reverse()
          .find(
            (r) =>
              (allowSelf || r.id !== fixed.placement) && contains(r, acquire),
          );
  if (target) return boundaryCanvasEndpoint(point, target, zoom, previous);
  const origin = canvasEndpointPoint(fixed, rectangles) ?? point;
  const dx = origin.x - point.x,
    dy = origin.y - point.y;
  const score = (side: CanvasSide) =>
    dx * direction[side].x + dy * direction[side].y;
  let side = (["n", "e", "s", "w"] as CanvasSide[]).sort(
    (a, b) => score(b) - score(a),
  )[0];
  if (previous && score(side) <= score(previous.side) + switchMargin)
    side = previous.side;
  return { point: { ...point }, side };
}
export function canvasConnectorPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromSide: CanvasSide,
  toSide: CanvasSide,
  routing: CanvasConnector["routing"],
  waypoints?: CanvasPoint[],
  bounds?: { from?: CanvasRect; to?: CanvasRect },
): { d: string; label: CanvasPoint; points: CanvasPoint[] } {
  const selfLoop = !!bounds?.from && bounds.from.id === bounds.to?.id;
  const selfCurve = selfLoop && routing === "curve";
  // A chord or a single cubic between ports on one object cuts through its
  // body. All self connections first resolve an outside route.
  if (selfLoop && routing === "straight") routing = "elbow";
  if (selfCurve) routing = "rounded";
  const a = direction[fromSide],
    b = direction[toSide];
  // A positive gap is not enough: a 1–2px terminal leg hides under its
  // arrowhead and rounded corner when a bound object is resized.
  const clearance = 40;
  const distance = Math.max(
    clearance,
    Math.min(180, Math.hypot(to.x - from.x, to.y - from.y) * 0.45),
  );
  const p = { x: from.x + a.x * distance, y: from.y + a.y * distance },
    q = { x: to.x + b.x * distance, y: to.y + b.y * distance };
  let points: CanvasPoint[];
  if (waypoints?.length) {
    points = [from, ...waypoints.map((p) => ({ ...p })), to];
    if (routing === "elbow" || routing === "rounded") {
      if (a.x) points[1].y = from.y;
      else points[1].x = from.x;
      if (b.x) points[points.length - 2].y = to.y;
      else points[points.length - 2].x = to.x;
    }
  } else if (routing === "straight") points = [from, to];
  else if (routing === "elbow" || routing === "rounded") {
    if (from.x === to.x && from.y === to.y && fromSide === toSide) {
      // Overlapping ports still need a loop, rather than a collapsed U-turn.
      const across = { x: -a.y * distance, y: a.x * distance };
      points = [
        from,
        p,
        { x: p.x + across.x, y: p.y + across.y },
        {
          x: p.x + across.x + a.x * distance,
          y: p.y + across.y + a.y * distance,
        },
        { x: p.x + a.x * distance, y: p.y + a.y * distance },
        to,
      ];
    } else if (a.x && b.x) {
      const forward = a.x * (to.x - from.x) >= clearance * 2;
      if (a.x === b.x && from.y !== to.y) {
        const x =
          (a.x > 0 ? Math.max(from.x, to.x) : Math.min(from.x, to.x)) +
          a.x * distance;
        points = [from, { x, y: from.y }, { x, y: to.y }, to];
      } else if (a.x !== b.x && forward) {
        const x = (from.x + to.x) / 2;
        points = [from, { x, y: from.y }, { x, y: to.y }, to];
      } else {
        const y = Math.min(from.y, to.y) - distance;
        points = [from, p, { x: p.x, y }, { x: q.x, y }, q, to];
      }
    } else if (a.y && b.y) {
      const forward = a.y * (to.y - from.y) >= clearance * 2;
      if (a.y === b.y && from.x !== to.x) {
        const y =
          (a.y > 0 ? Math.max(from.y, to.y) : Math.min(from.y, to.y)) +
          a.y * distance;
        points = [from, { x: from.x, y }, { x: to.x, y }, to];
      } else if (a.y !== b.y && forward) {
        const y = (from.y + to.y) / 2;
        points = [from, { x: from.x, y }, { x: to.x, y }, to];
      } else {
        const x = Math.min(from.x, to.x) - distance;
        points = [from, p, { x, y: p.y }, { x, y: q.y }, q, to];
      }
    } else if (a.x) {
      // Enter a north/south port from outside its shape, never overshoot it
      // and retrace the same vertical leg. Use a dogleg when an L cannot fit.
      if (
        a.x * (to.x - from.x) >= clearance &&
        b.y * (from.y - to.y) >= clearance
      ) {
        points = [from, { x: to.x, y: from.y }, to];
      } else {
        let x =
          a.x * (to.x - from.x) >= clearance * 2 ? (from.x + to.x) / 2 : p.x;
        if (Math.abs(x - to.x) < 1e-8) x += a.x * distance;
        const y = Math.abs(q.y - from.y) < 1e-8 ? q.y + b.y * distance : q.y;
        points = [from, { x, y: from.y }, { x, y }, { x: to.x, y }, to];
      }
    } else {
      if (
        a.y * (to.y - from.y) >= clearance &&
        b.x * (from.x - to.x) >= clearance
      ) {
        points = [from, { x: from.x, y: to.y }, to];
      } else {
        let y =
          a.y * (to.y - from.y) >= clearance * 2 ? (from.y + to.y) / 2 : p.y;
        if (Math.abs(y - to.y) < 1e-8) y += a.y * distance;
        const x = Math.abs(q.x - from.x) < 1e-8 ? q.x + b.x * distance : q.x;
        points = [from, { x: from.x, y }, { x, y }, { x, y: to.y }, to];
      }
    }
  } else {
    points = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24,
        u = 1 - t;
      return {
        x:
          u * u * u * from.x +
          3 * u * u * t * p.x +
          3 * u * t * t * q.x +
          t * t * t * to.x,
        y:
          u * u * u * from.y +
          3 * u * u * t * p.y +
          3 * u * t * t * q.y +
          t * t * t * to.y,
      };
    });
    return {
      d: `M ${from.x} ${from.y} C ${p.x} ${p.y}, ${q.x} ${q.y}, ${to.x} ${to.y}`,
      label: points[12],
      points,
    };
  }
  if (
    !waypoints?.length &&
    bounds &&
    (routing === "elbow" || routing === "rounded")
  ) {
    points =
      routeBoundCanvasLine(
        from,
        to,
        fromSide,
        toSide,
        bounds.from,
        bounds.to,
      ) ?? points;
  }
  const cleaned: CanvasPoint[] = [];
  for (const point of points) {
    if (
      cleaned.length &&
      Math.hypot(point.x - cleaned.at(-1)!.x, point.y - cleaned.at(-1)!.y) <
        1e-8
    )
      continue;
    while (cleaned.length > 1) {
      const prev = cleaned.at(-2)!,
        last = cleaned.at(-1)!,
        dx = last.x - prev.x,
        dy = last.y - prev.y,
        nx = point.x - last.x,
        ny = point.y - last.y;
      if (Math.abs(dx * ny - dy * nx) > 1e-8 || dx * nx + dy * ny <= 0) break;
      cleaned.pop();
    }
    cleaned.push(point);
  }
  points = cleaned;
  if (waypoints?.length && (routing === "elbow" || routing === "rounded")) {
    const first = points[1],
      last = points.at(-2);
    const invalid =
      !first ||
      !last ||
      (first.x - from.x) * a.x + (first.y - from.y) * a.y <= 1e-8 ||
      (last.x - to.x) * b.x + (last.y - to.y) * b.y <= 1e-8 ||
      points.some((point, i) => {
        if (!i) return false;
        const prev = points[i - 1],
          before = points[i - 2];
        return (
          (point.x !== prev.x && point.y !== prev.y) ||
          (before &&
            (prev.x - before.x) * (point.x - prev.x) +
              (prev.y - before.y) * (point.y - prev.y) <
              0)
        );
      });
    // Resizing or moving an endpoint can invalidate formerly valid bends.
    // Reroute the display without rewriting the saved, user-authored bends.
    if (invalid)
      return canvasConnectorPath(
        from,
        to,
        fromSide,
        toSide,
        routing,
        undefined,
        bounds,
      );
  }
  return {
    d: canvasPolylinePath(
      points,
      selfCurve ? 32 : routing === "rounded" ? 12 : 0,
    ),
    label: canvasPathMidpoint(points),
    points,
  };
}
export function canvasPathMidpoint(points: CanvasPoint[]): CanvasPoint {
  if (!points.length) return { x: 0, y: 0 };
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i]) {
      const t = remaining / lengths[i],
        a = points[i],
        b = points[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= lengths[i];
  }
  return { ...points.at(-1)! };
}
export function canvasEndpointPoint(
  endpoint: CanvasEndpoint,
  rectangles: CanvasRect[],
): CanvasPoint | null {
  if (endpoint.point) return endpoint.point;
  const r = rectangles.find((r) => r.id === endpoint.placement);
  if (!r) return null;
  if (!endpoint.anchor) return canvasPort(r, endpoint.side);
  return canvasBoundaryProjection(r, {
    x: r.x + endpoint.anchor.x * r.width,
    y: r.y + endpoint.anchor.y * r.height,
  }).point;
}
/** Shared by live reconnection and commit: only the dragged end changes. */
export function reconnectCanvasEndpoint(
  connector: CanvasConnector,
  end: "from" | "to",
  point: CanvasPoint,
  snapped: CanvasEndpoint | null,
  rectangles: CanvasRect[],
  stability?: { previous?: CanvasConnector; zoom: number },
): CanvasConnector {
  const fixed = canvasEndpointPoint(
    connector[end === "from" ? "to" : "from"],
    rectangles,
  );
  const dx = (fixed?.x ?? point.x) - point.x,
    dy = (fixed?.y ?? point.y) - point.y;
  const side: CanvasSide =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "e" : "w") : dy >= 0 ? "s" : "n";
  const next: CanvasConnector = {
    ...connector,
    [end]: snapped ?? { point: { ...point }, side },
    waypoints: [],
  };
  const previous = stability?.previous;
  if (
    !previous ||
    (next.routing !== "rounded" && next.routing !== "elbow") ||
    (["from", "to"] as const).some(
      (e) =>
        previous[e].side !== next[e].side ||
        previous[e].placement !== next[e].placement,
    )
  )
    return next;
  const before = canvasConnectorGeometry(previous, rectangles),
    automatic = canvasConnectorGeometry(next, rectangles),
    moving = canvasEndpointPoint(next[end], rectangles);
  if (!before || !automatic || !moving || before.points.length < 3) return next;
  const points = before.points.map((p) => ({ ...p })),
    index = end === "from" ? 0 : points.length - 1,
    neighbour = end === "from" ? 1 : index - 1,
    cross = direction[next[end].side].x ? "y" : "x";
  points[index] = moving;
  points[neighbour][cross] = moving[cross];
  const a = direction[next.from.side],
    b = direction[next.to.side];
  const forward = (u: CanvasPoint, v: CanvasPoint, d: CanvasPoint) =>
    (v.x - u.x) * d.x + (v.y - u.y) * d.y > 1e-8;
  if (
    !forward(points[0], points[1], a) ||
    !forward(points.at(-1)!, points.at(-2)!, b)
  )
    return next;
  const obstacles = rectangles.filter(
    (r) => r.id === next.from.placement || r.id === next.to.placement,
  );
  for (let i = 1; i < points.length; i++) {
    const u = points[i - 1],
      v = points[i],
      prior = points[i - 2];
    if (
      (u.x !== v.x && u.y !== v.y) ||
      (prior &&
        (u.x - prior.x) * (v.x - u.x) + (u.y - prior.y) * (v.y - u.y) < 0)
    )
      return next;
    for (const r of obstacles) {
      if (
        (i === 1 && r.id === next.from.placement) ||
        (i === points.length - 1 && r.id === next.to.placement)
      )
        continue;
      const blocked =
        u.y === v.y
          ? u.y > r.y + 1e-8 &&
            u.y < r.y + r.height - 1e-8 &&
            Math.max(u.x, v.x) > r.x + 1e-8 &&
            Math.min(u.x, v.x) < r.x + r.width - 1e-8
          : u.x > r.x + 1e-8 &&
            u.x < r.x + r.width - 1e-8 &&
            Math.max(u.y, v.y) > r.y + 1e-8 &&
            Math.min(u.y, v.y) < r.y + r.height - 1e-8;
      if (blocked) return next;
    }
  }
  const cost = (p: CanvasPoint[]) => {
    let value = 0,
      last: string | null = null;
    for (let i = 1; i < p.length; i++) {
      const dx = p[i].x - p[i - 1].x,
        dy = p[i].y - p[i - 1].y;
      if (!dx && !dy) continue;
      const axis = dx ? "x" : "y";
      value += Math.abs(dx) + Math.abs(dy) + (last && axis !== last ? 20 : 0);
      last = axis;
    }
    return value;
  };
  // Near-equal shortest routes must not alternate above/below a shape on
  // every pointer sample. Large detours and invalid routes still reroute.
  return cost(points) <= cost(automatic.points) + 24 / stability!.zoom
    ? { ...next, waypoints: points.slice(1, -1) }
    : next;
}
export function canvasConnectorGeometry(
  c: CanvasConnector,
  rectangles: CanvasRect[],
) {
  const a = canvasEndpointPoint(c.from, rectangles),
    b = canvasEndpointPoint(c.to, rectangles);
  return a && b
    ? canvasConnectorPath(
        a,
        b,
        c.from.side,
        c.to.side,
        c.routing,
        c.waypoints,
        {
          from: rectangles.find((r) => r.id === c.from.placement),
          to: rectangles.find((r) => r.id === c.to.placement),
        },
      )
    : null;
}
export function canvasPolylinePath(points: CanvasPoint[], radius = 0) {
  if (!points.length) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i],
      prev = points[i - 1],
      next = points[i + 1];
    if (radius && next) {
      const len = Math.hypot(p.x - prev.x, p.y - prev.y),
        after = Math.hypot(next.x - p.x, next.y - p.y),
        r = Math.min(radius, len / 2, after / 2);
      if (len && after) {
        d += ` L ${p.x + ((prev.x - p.x) * r) / len} ${p.y + ((prev.y - p.y) * r) / len} Q ${p.x} ${p.y} ${p.x + ((next.x - p.x) * r) / after} ${p.y + ((next.y - p.y) * r) / after}`;
        continue;
      }
    }
    d += ` L ${p.x} ${p.y}`;
  }
  return d;
}
/** True crossings only: shared endpoints and parallel/overlapping segments do not jump. */
export function canvasCrossings(
  points: CanvasPoint[],
  others: CanvasPoint[][],
) {
  const hits: CanvasPoint[] = [];
  for (let i = 1; i < points.length; i++)
    for (const other of others)
      for (let j = 1; j < other.length; j++) {
        const a = points[i - 1],
          b = points[i],
          c = other[j - 1],
          d = other[j];
        const rx = b.x - a.x,
          ry = b.y - a.y,
          sx = d.x - c.x,
          sy = d.y - c.y,
          det = rx * sy - ry * sx;
        if (Math.abs(det) < 1e-8) continue;
        const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / det,
          u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / det;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          const hit = { x: a.x + t * rx, y: a.y + t * ry };
          if (
            [points[0], points.at(-1)!, other[0], other.at(-1)!].some(
              (p) => Math.hypot(p.x - hit.x, p.y - hit.y) < 1e-6,
            )
          )
            continue;
          if (!hits.some((h) => Math.hypot(h.x - hit.x, h.y - hit.y) < 10))
            hits.push(hit);
        }
      }
  return hits;
}
