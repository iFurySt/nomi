import type { CanvasPoint, CanvasSide } from "./document";
type Bounds = { x: number; y: number; width: number; height: number };
const vectors: Record<CanvasSide, CanvasPoint> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};
const cache = new Map<string, CanvasPoint[] | null>();
/** Orthogonal visibility search around the two endpoint shapes. Port stubs and
 * body intersections are constraints; distance and bends are the primary cost. */
export function routeBoundCanvasLine(
  from: CanvasPoint,
  to: CanvasPoint,
  fromSide: CanvasSide,
  toSide: CanvasSide,
  source?: Bounds,
  target?: Bounds,
): CanvasPoint[] | null {
  const key = JSON.stringify([
    from,
    to,
    fromSide,
    toSide,
    source && [source.x, source.y, source.width, source.height],
    target && [target.x, target.y, target.width, target.height],
    !!source && source === target,
  ]);
  if (cache.has(key)) return cache.get(key)!.map((p) => ({ ...p }));
  const margin = 40,
    a = vectors[fromSide],
    b = vectors[toSide],
    rects = [source, target].filter((r): r is Bounds => !!r);
  const selfLoop = !!source && source === target;
  const obstacles = selfLoop
    ? [
        {
          x: source!.x - margin,
          y: source!.y - margin,
          width: source!.width + 2 * margin,
          height: source!.height + 2 * margin,
        },
      ]
    : rects;
  if (!rects.length) return null;
  const stub = (
    point: CanvasPoint,
    side: CanvasSide,
    r?: Bounds,
  ): CanvasPoint => {
    const axis = side === "e" || side === "w" ? "x" : "y",
      cross = axis === "x" ? "y" : "x",
      dim = axis === "x" ? "width" : "height",
      crossDim = axis === "x" ? "height" : "width",
      sign = side === "e" || side === "s" ? 1 : -1;
    const boundary = r ? r[axis] + (sign > 0 ? r[dim] : 0) : point[axis];
    let distance = margin;
    // Close neighbours need a lane inside the available gap, rather than a
    // fixed stub that lands inside the opposite shape.
    for (const other of rects) {
      if (
        other === r ||
        point[cross] <= other[cross] ||
        point[cross] >= other[cross] + other[crossDim]
      )
        continue;
      const gap = sign * (other[axis] + (sign < 0 ? other[dim] : 0) - boundary);
      if (gap > 0) distance = Math.min(distance, gap / 2);
    }
    return { ...point, [axis]: boundary + sign * distance };
  };
  const p = stub(from, fromSide, source),
    q = stub(to, toSide, target),
    xs = [p.x, q.x],
    ys = [p.y, q.y];
  const inside = (p: CanvasPoint, r: Bounds) =>
    p.x > r.x + 1e-8 &&
    p.x < r.x + r.width - 1e-8 &&
    p.y > r.y + 1e-8 &&
    p.y < r.y + r.height - 1e-8;
  if (rects.some((r) => inside(p, r) || inside(q, r))) return null;
  for (const r of rects) {
    xs.push(r.x - margin, r.x, r.x + r.width, r.x + r.width + margin);
    ys.push(r.y - margin, r.y, r.y + r.height, r.y + r.height + margin);
  }
  if (selfLoop && p.x === q.x && p.y === q.y) {
    xs.push(p.x + a.x * margin, p.x + margin, p.x - margin);
    ys.push(p.y + a.y * margin, p.y + margin, p.y - margin);
  }
  let idealX = (p.x + q.x) / 2,
    idealY = Math.min(...rects.map((r) => r.y)) - margin;
  if (source && target) {
    if (source.x + source.width <= target.x)
      idealX = (source.x + source.width + target.x) / 2;
    if (target.x + target.width <= source.x)
      idealX = (target.x + target.width + source.x) / 2;
    if (source.y + source.height <= target.y)
      idealY = (source.y + source.height + target.y) / 2;
    if (target.y + target.height <= source.y)
      idealY = (target.y + target.height + source.y) / 2;
  }
  xs.push(idealX);
  ys.push(idealY);
  const sort = (v: number[]) => [...new Set(v)].sort((a, b) => a - b),
    xx = sort(xs),
    yy = sort(ys),
    cols = xx.length,
    nodes = yy.flatMap((y) => xx.map((x) => ({ x, y }))),
    start = nodes.findIndex((n) => n.x === p.x && n.y === p.y),
    end = nodes.findIndex((n) => n.x === q.x && n.y === q.y);
  const directions = [vectors.e, vectors.s, vectors.w, vectors.n],
    initial = directions.findIndex((d) => d.x === a.x && d.y === a.y),
    badFinal = directions.findIndex((d) => d.x === b.x && d.y === b.y),
    final = (badFinal + 2) % 4;
  const blocked = (u: CanvasPoint, v: CanvasPoint) =>
    obstacles.some((r) =>
      u.y === v.y
        ? u.y > r.y + 1e-8 &&
          u.y < r.y + r.height - 1e-8 &&
          Math.max(u.x, v.x) > r.x + 1e-8 &&
          Math.min(u.x, v.x) < r.x + r.width - 1e-8
        : u.x > r.x + 1e-8 &&
          u.x < r.x + r.width - 1e-8 &&
          Math.max(u.y, v.y) > r.y + 1e-8 &&
          Math.min(u.y, v.y) < r.y + r.height - 1e-8,
    );
  const count = nodes.length * 4,
    cost = Array<number>(count).fill(Infinity),
    prev = Array<number>(count).fill(-1),
    done = new Set<number>();
  cost[start * 4 + initial] = 0;
  let finish = -1,
    finishCost = Infinity;
  for (let step = 0; step < count; step++) {
    let state = -1,
      best = Infinity;
    for (let i = 0; i < count; i++)
      if (!done.has(i) && cost[i] < best) {
        state = i;
        best = cost[i];
      }
    if (state < 0 || best >= finishCost) break;
    done.add(state);
    const index = Math.floor(state / 4),
      last = state % 4,
      row = Math.floor(index / cols),
      col = index % cols;
    if (index === end && last !== badFinal) {
      const value = best + (last === final ? 0 : 20);
      if (value < finishCost) {
        finish = state;
        finishCost = value;
      }
    }
    for (let d = 0; d < 4; d++) {
      if ((d + 2) % 4 === last) continue;
      const nx = col + directions[d].x,
        ny = row + directions[d].y;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= yy.length) continue;
      const next = ny * cols + nx,
        u = nodes[index],
        v = nodes[next];
      if (blocked(u, v)) continue;
      const length = Math.abs(u.x - v.x) + Math.abs(u.y - v.y),
        preference =
          (d % 2 ? Math.abs(u.x - idealX) : Math.abs(u.y - idealY)) *
          length *
          1e-6;
      const value = best + length + (d === last ? 0 : 20) + preference,
        k = next * 4 + d;
      if (value < cost[k] - 1e-8) {
        cost[k] = value;
        prev[k] = state;
      }
    }
  }
  if (finish < 0) return null;
  const route: CanvasPoint[] = [];
  for (let s = finish; s >= 0; s = prev[s])
    route.push(nodes[Math.floor(s / 4)]);
  const result = [from, ...route.reverse(), to];
  if (cache.size >= 512) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result.map((p) => ({ ...p }));
}
