import type { CanvasCommand, CanvasResizeDirection } from "./document";
import { snapCanvasRect, type CanvasRect, type CanvasGuide } from "./geometry";

export function canvasSelectionBounds(rects: CanvasRect[]): CanvasRect {
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    id: "selection.bounds",
    content: rects[0]?.content ?? "selection.content",
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}
export type CanvasAlign =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "horizontal"
  | "vertical"
  | "same-width"
  | "same-height";
export function canvasArrange(
  rects: CanvasRect[],
  action: CanvasAlign,
): CanvasCommand[] {
  if (rects.length < 2 || rects.some((r) => r.locked)) return [];
  const bounds = canvasSelectionBounds(rects);
  if (action === "same-width" || action === "same-height")
    return rects.map((r) => ({
      type: "resize",
      id: r.id,
      width: action === "same-width" ? rects[0].width : r.width,
      height: action === "same-height" ? rects[0].height : r.height,
    }));
  if (action === "horizontal" || action === "vertical") {
    if (rects.length < 3) return [];
    const axis = action === "horizontal" ? "x" : "y",
      dim = axis === "x" ? "width" : "height";
    const sorted = [...rects].sort(
      (a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id),
    );
    const gap =
      (bounds[dim] - sorted.reduce((n, r) => n + r[dim], 0)) /
      (sorted.length - 1);
    if (gap < 0) return [];
    let position = sorted[0][axis];
    return sorted.map((r) => {
      const value = position;
      position += r[dim] + gap;
      return {
        type: "move",
        id: r.id,
        x: axis === "x" ? value : r.x,
        y: axis === "y" ? value : r.y,
      };
    });
  }
  return rects.map((r) => ({
    type: "move",
    id: r.id,
    x:
      action === "left"
        ? bounds.x
        : action === "center"
          ? bounds.x + (bounds.width - r.width) / 2
          : action === "right"
            ? bounds.x + bounds.width - r.width
            : r.x,
    y:
      action === "top"
        ? bounds.y
        : action === "middle"
          ? bounds.y + (bounds.height - r.height) / 2
          : action === "bottom"
            ? bounds.y + bounds.height - r.height
            : r.y,
  }));
}

/** Edge/center and equal-gap candidates compete within the same screen radius. */
export function snapCanvasLayout(
  moving: CanvasRect,
  others: CanvasRect[],
  zoom: number,
) {
  const edge = snapCanvasRect(moving, others, zoom);
  const result = { ...edge, guides: [...edge.guides] };
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "width" : "height",
      cross = axis === "x" ? "y" : "x",
      crossSize = axis === "x" ? "height" : "width";
    const candidates = others
      .filter(
        (r) =>
          r.id !== moving.id &&
          r[cross] < moving[cross] + moving[crossSize] &&
          r[cross] + r[crossSize] > moving[cross],
      )
      .sort((a, b) => a[axis] - b[axis]);
    let best = result.guides.some((g) => !g.kind && g.axis === axis)
      ? Math.abs(edge[axis] - moving[axis]) - 1e-8
      : 6 / zoom + 1e-8;
    let chosen: { delta: number; guides: CanvasGuide[] } | null = null;
    for (let i = 1; i < candidates.length; i++) {
      const a = candidates[i - 1],
        b = candidates[i],
        gap = b[axis] - a[axis] - a[size];
      if (gap < 0) continue;
      for (const mode of ["between", "after", "before"] as const) {
        const value =
          mode === "between"
            ? (a[axis] + a[size] + b[axis] - moving[size]) / 2
            : mode === "after"
              ? b[axis] + b[size] + gap
              : a[axis] - gap - moving[size];
        const delta = value - moving[axis];
        if (Math.abs(delta) >= best) continue;
        const distance = mode === "between" ? (gap - moving[size]) / 2 : gap;
        if (
          distance < 0 ||
          candidates.some(
            (r) =>
              r[axis] < value + moving[size] - 1e-8 &&
              r[axis] + r[size] > value + 1e-8,
          )
        )
          continue;
        const position =
          Math.max(
            moving[cross] + moving[crossSize],
            a[cross] + a[crossSize],
            b[cross] + b[crossSize],
          ) +
          16 / zoom;
        const measure = (from: number, to: number): CanvasGuide => ({
          axis,
          position,
          from,
          to,
          kind: "gap",
          value: distance,
        });
        const guides =
          mode === "between"
            ? [
                measure(a[axis] + a[size], value),
                measure(value + moving[size], b[axis]),
              ]
            : [
                measure(a[axis] + a[size], b[axis]),
                mode === "after"
                  ? measure(b[axis] + b[size], value)
                  : measure(value + moving[size], a[axis]),
              ];
        best = Math.abs(delta);
        chosen = { delta, guides };
      }
    }
    if (chosen) {
      result[axis] = moving[axis] + chosen.delta;
      result.guides = result.guides
        .filter((g) => g.axis !== axis)
        .concat(chosen.guides);
    }
  }
  result.guides = result.guides.filter((g) => {
    if (g.kind) return true;
    const axis = g.axis,
      dim = axis === "x" ? "width" : "height",
      start = result[axis],
      end = start + moving[dim];
    return !(
      Math.abs(g.position - (start + end) / 2) < 1e-8 &&
      result.guides.some(
        (h) =>
          !h.kind && h.axis === axis && Math.abs(h.position - start) < 1e-8,
      ) &&
      result.guides.some(
        (h) => !h.kind && h.axis === axis && Math.abs(h.position - end) < 1e-8,
      )
    );
  });
  return result;
}

/** Only dragged edges snap; the opposite edge stays fixed. */
export function snapCanvasResize(
  original: CanvasRect,
  resized: CanvasRect,
  direction: CanvasResizeDirection,
  others: CanvasRect[],
  zoom: number,
) {
  const result = { ...resized },
    guides: CanvasGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const dim = axis === "x" ? "width" : "height",
      low = axis === "x" ? "w" : "n",
      high = axis === "x" ? "e" : "s";
    if (!direction.includes(low) && !direction.includes(high)) continue;
    const isLow = direction.includes(low),
      fixed = isLow ? original[axis] + original[dim] : original[axis],
      edge = isLow ? resized[axis] : resized[axis] + resized[dim];
    let best = 6 / zoom + 1e-8,
      chosen: { value: number; other: CanvasRect; size: boolean } | null = null;
    for (const other of others)
      for (const size of [false, true])
        for (const factor of size ? [0] : [0, 0.5, 1]) {
          const value = size
            ? fixed + (isLow ? -other[dim] : other[dim])
            : other[axis] + other[dim] * factor;
          const length = isLow ? fixed - value : value - fixed;
          if (
            length < (resized.shape ? 16 : axis === "x" ? 160 : 120) ||
            length > (axis === "x" ? 1600 : 2400)
          )
            continue;
          if (Math.abs(value - edge) < best) {
            best = Math.abs(value - edge);
            chosen = { value, other, size };
          }
        }
    if (!chosen) continue;
    result[axis] = isLow ? chosen.value : fixed;
    result[dim] = Math.abs(chosen.value - fixed);
    const cross = axis === "x" ? "y" : "x",
      crossDim = axis === "x" ? "height" : "width";
    if (chosen.size) {
      for (const r of [result, chosen.other])
        guides.push({
          axis,
          kind: "size",
          value: result[dim],
          from: r[axis],
          to: r[axis] + r[dim],
          position: r[cross] + r[crossDim] + 12 / zoom,
        });
    } else
      guides.push({
        axis,
        position: chosen.value,
        from: Math.min(result[cross], chosen.other[cross]) - 12 / zoom,
        to:
          Math.max(
            result[cross] + result[crossDim],
            chosen.other[cross] + chosen.other[crossDim],
          ) +
          12 / zoom,
      });
  }
  return { rect: result, guides };
}

/** Geometry-only transform around the selection centre; content formatting is separate. */
export function canvasTransformSelection(
  rects: CanvasRect[],
  action: "rotate" | "flip-x" | "flip-y",
): CanvasCommand[] {
  if (!rects.length || rects.some((r) => r.locked)) return [];
  const bounds = canvasSelectionBounds(rects),
    cx = bounds.x + bounds.width / 2,
    cy = bounds.y + bounds.height / 2;
  return rects.flatMap((r): CanvasCommand[] => {
    const x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    const width = action === "rotate" ? r.height : r.width,
      height = action === "rotate" ? r.width : r.height;
    return [
      {
        type: "move",
        id: r.id,
        x:
          (action === "rotate"
            ? cx - (y - cy)
            : action === "flip-x"
              ? 2 * cx - x
              : x) -
          width / 2,
        y:
          (action === "rotate"
            ? cy + (x - cx)
            : action === "flip-y"
              ? 2 * cy - y
              : y) -
          height / 2,
      },
      ...(action === "rotate"
        ? [{ type: "resize" as const, id: r.id, width, height }]
        : []),
    ];
  });
}
