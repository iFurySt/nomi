import type { CanvasShape, CanvasShapeStyle, CanvasPoint } from "./document";
export const canvasShapeNames: Record<CanvasShape, string> = {
  rectangle: "矩形",
  "rounded-rectangle": "圆角矩形",
  ellipse: "椭圆",
  diamond: "菱形",
  triangle: "三角形",
  "right-triangle": "直角三角形",
  parallelogram: "平行四边形",
  trapezoid: "梯形",
  hexagon: "六边形",
  pentagon: "五边形",
  octagon: "八边形",
  star: "星形",
  cylinder: "圆柱",
  cube: "立方体",
  chevron: "燕尾形",
  "arrow-left": "左箭头",
  "arrow-right": "右箭头",
  "arrow-both": "双向箭头",
  cross: "十字",
  cloud: "云朵",
  "speech-bubble": "对话框",
  callout: "气泡",
  "brace-left": "左大括号",
  "brace-right": "右大括号",
  document: "文档",
  text: "文本",
};
const poly: Partial<Record<CanvasShape, number[][]>> = {
  diamond: [
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ],
  triangle: [
    [50, 0],
    [100, 100],
    [0, 100],
  ],
  "right-triangle": [
    [0, 0],
    [100, 100],
    [0, 100],
  ],
  parallelogram: [
    [20, 0],
    [100, 0],
    [80, 100],
    [0, 100],
  ],
  trapezoid: [
    [20, 0],
    [80, 0],
    [100, 100],
    [0, 100],
  ],
  hexagon: [
    [25, 0],
    [75, 0],
    [100, 50],
    [75, 100],
    [25, 100],
    [0, 50],
  ],
  pentagon: [
    [50, 0],
    [100, 38],
    [82, 100],
    [18, 100],
    [0, 38],
  ],
  octagon: [
    [30, 0],
    [70, 0],
    [100, 30],
    [100, 70],
    [70, 100],
    [30, 100],
    [0, 70],
    [0, 30],
  ],
  chevron: [
    [0, 0],
    [75, 0],
    [100, 50],
    [75, 100],
    [0, 100],
    [25, 50],
  ],
  "arrow-right": [
    [0, 25],
    [60, 25],
    [60, 0],
    [100, 50],
    [60, 100],
    [60, 75],
    [0, 75],
  ],
  "arrow-left": [
    [100, 25],
    [40, 25],
    [40, 0],
    [0, 50],
    [40, 100],
    [40, 75],
    [100, 75],
  ],
  "arrow-both": [
    [0, 50],
    [30, 0],
    [30, 25],
    [70, 25],
    [70, 0],
    [100, 50],
    [70, 100],
    [70, 75],
    [30, 75],
    [30, 100],
  ],
  cross: [
    [30, 0],
    [70, 0],
    [70, 30],
    [100, 30],
    [100, 70],
    [70, 70],
    [70, 100],
    [30, 100],
    [30, 70],
    [0, 70],
    [0, 30],
    [30, 30],
  ],
  star: Array.from({ length: 10 }, (_, i) => {
    let a = ((i * 36 - 90) * Math.PI) / 180,
      r = i % 2 ? 22 : 50;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  }),
};
export function canvasShapePolygon(
  shape: CanvasShape,
  style: CanvasShapeStyle = {},
) {
  return poly[shape]?.map(([x, y]) => {
    if (style.flipX) x = 100 - x;
    if (style.flipY) y = 100 - y;
    for (let i = 0; i < (style.rotation ?? 0) / 90; i++) [x, y] = [100 - y, x];
    return { x, y };
  });
}
// Flatten only our fixed semantic outlines. No user supplied path is evaluated.
const outlineCache = new Map<CanvasShape, CanvasPoint[]>();
function curvedOutline(shape: CanvasShape): CanvasPoint[] | undefined {
  if (shape === "brace-left" || shape === "brace-right") return undefined;
  if (outlineCache.has(shape)) return outlineCache.get(shape);
  const path = canvasShapePaths[shape];
  if (!path) return undefined;
  const tokens = path.match(/[MLHVCQZ]|-?\d+(?:\.\d+)?/g)!;
  const points: CanvasPoint[] = [];
  let p = { x: 0, y: 0 },
    i = 0;
  const number = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const op = tokens[i++];
    if (op === "Z") break;
    if (op === "M" || op === "L") p = { x: number(), y: number() };
    else if (op === "H") p = { x: number(), y: p.y };
    else if (op === "V") p = { x: p.x, y: number() };
    else if (op === "C" || op === "Q") {
      const start = p,
        a = { x: number(), y: number() },
        b = op === "C" ? { x: number(), y: number() } : undefined,
        end = { x: number(), y: number() };
      for (let step = 1; step <= 48; step++) {
        const t = step / 48,
          u = 1 - t;
        points.push(
          b
            ? {
                x:
                  u * u * u * start.x +
                  3 * u * u * t * a.x +
                  3 * u * t * t * b.x +
                  t * t * t * end.x,
                y:
                  u * u * u * start.y +
                  3 * u * u * t * a.y +
                  3 * u * t * t * b.y +
                  t * t * t * end.y,
              }
            : {
                x: u * u * start.x + 2 * u * t * a.x + t * t * end.x,
                y: u * u * start.y + 2 * u * t * a.y + t * t * end.y,
              },
        );
      }
      p = end;
      continue;
    }
    points.push(p);
  }
  outlineCache.set(shape, points);
  return points;
}
/** Closed semantic outline in the same 100×100 space as ShapeGlyph. Open
 * braces and invisible text use their frame, matching the cardinal ports. */
export function canvasShapeOutline(
  shape: CanvasShape,
  style: CanvasShapeStyle = {},
): CanvasPoint[] {
  const polygon = canvasShapePolygon(shape, style);
  if (polygon) return polygon;
  const points =
    shape === "ellipse"
      ? Array.from({ length: 256 }, (_, i) => ({
          x: 50 + 50 * Math.cos((i * Math.PI) / 128),
          y: 50 + 50 * Math.sin((i * Math.PI) / 128),
        }))
      : shape === "rounded-rectangle"
        ? [
            [92, 8, -90],
            [92, 92, 0],
            [8, 92, 90],
            [8, 8, 180],
          ].flatMap(([cx, cy, start]) =>
            Array.from({ length: 17 }, (_, i) => ({
              x: cx + 8 * Math.cos(((start + (i * 90) / 16) * Math.PI) / 180),
              y: cy + 8 * Math.sin(((start + (i * 90) / 16) * Math.PI) / 180),
            })),
          )
        : (curvedOutline(shape) ?? [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ]);
  return points.map((p) => {
    let { x, y } = p;
    if (style.flipX) x = 100 - x;
    if (style.flipY) y = 100 - y;
    for (let i = 0; i < (style.rotation ?? 0) / 90; i++) [x, y] = [100 - y, x];
    return { x, y };
  });
}
/** Intersect the cardinal ray with the semantic polygon, not its bounding box. */
export function canvasShapePort(
  shape: CanvasShape,
  side: "n" | "e" | "s" | "w",
  style?: CanvasShapeStyle,
): CanvasPoint {
  const points =
      canvasShapePolygon(shape, style) ??
      curvedOutline(shape)?.map((p) => {
        let { x, y } = p;
        if (style?.flipX) x = 100 - x;
        if (style?.flipY) y = 100 - y;
        for (let i = 0; i < (style?.rotation ?? 0) / 90; i++)
          [x, y] = [100 - y, x];
        return { x, y };
      }),
    dx = side === "e" ? 1 : side === "w" ? -1 : 0,
    dy = side === "s" ? 1 : side === "n" ? -1 : 0;
  let best = 50;
  if (points)
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        vx = b.x - a.x,
        vy = b.y - a.y,
        det = dx * vy - dy * vx;
      if (Math.abs(det) < 1e-8) continue;
      const t = ((a.x - 50) * vy - (a.y - 50) * vx) / det,
        u = ((a.x - 50) * dy - (a.y - 50) * dx) / det;
      if (t >= 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
  return { x: (50 + dx * best) / 100, y: (50 + dy * best) / 100 };
}

export const canvasShapePaths: Partial<Record<CanvasShape, string>> = {
  cylinder:
    "M0 15 C0 -5 100 -5 100 15 V85 C100 105 0 105 0 85 Z M0 15 C0 35 100 35 100 15",
  cube: "M0 20 L25 0 H100 V80 L75 100 H0 Z M0 20 H75 V100 M75 20 L100 0 M75 20 L75 100 M75 100 L100 80",
  "speech-bubble":
    "M12 0 H88 Q100 0 100 12 V68 Q100 80 88 80 H60 L50 100 L40 80 H12 Q0 80 0 68 V12 Q0 0 12 0 Z",
  callout: "M50 0 C-10 0 -10 75 25 80 L15 100 L45 85 C110 95 125 0 50 0 Z",
  cloud:
    "M15 30 C0 10 25 0 35 12 C45 -5 70 -2 72 15 C100 0 105 35 90 40 C110 50 100 80 82 78 C85 100 55 105 48 88 C25 110 5 85 15 73 C-8 70 -5 35 15 30 Z",
  "brace-left": "M85 0 C35 0 65 43 15 50 C65 57 35 100 85 100",
  "brace-right": "M15 0 C65 0 35 43 85 50 C35 57 65 100 15 100",
  document: "M0 0 H100 V85 C70 60 30 110 0 85 Z",
};

/** Explicit pale fills need dark default ink on a dark host theme too. */
export function canvasShapeTextColor(
  style?: CanvasShapeStyle,
): string | undefined {
  if (style?.text?.color) return style.text.color;
  if (!style?.fill || style.fill === "none" || (style.fillOpacity ?? 1) < 0.5)
    return undefined;
  const rgb = [1, 3, 5]
    .map((i) => parseInt(style.fill!.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
    ? "#202124"
    : "#ffffff";
}
