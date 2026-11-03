/** Platform-neutral drawing data; coordinates are in the block's own space. */
export interface DrawingPoint {
  x: number;
  y: number;
}
export interface DrawingElement {
  id: string;
  kind: "pen" | "rectangle" | "ellipse" | "line" | "arrow";
  color: string;
  width: number;
  points: DrawingPoint[];
}
export interface DrawingBlock {
  id: string;
  type: "drawing";
  width: number;
  height: number;
  elements: DrawingElement[];
}
export const DRAWING_ELEMENTS_MAX = 300;
export const DRAWING_POINTS_MAX = 1024;
export function validateDrawing(block: DrawingBlock): void {
  const finite = (v: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (!finite(block.width, 160, 1600) || !finite(block.height, 120, 1200))
    throw Error("画布尺寸无效。");
  if (
    !Array.isArray(block.elements) ||
    block.elements.length > DRAWING_ELEMENTS_MAX
  )
    throw Error("画布最多容纳 300 个绘图对象。");
  const ids = new Set<string>();
  for (const e of block.elements) {
    if (
      !e ||
      typeof e !== "object" ||
      Array.isArray(e) ||
      typeof e.id !== "string" ||
      !/^[a-zA-Z][\w.-]{0,95}$/.test(e.id) ||
      ["constructor", "prototype", "__proto__"].includes(e.id) ||
      ids.has(e.id)
    )
      throw Error("绘图对象标识无效或重复。");
    ids.add(e.id);
    if (
      !["pen", "rectangle", "ellipse", "line", "arrow"].includes(e.kind) ||
      typeof e.color !== "string" ||
      !/^#[a-fA-F0-9]{6}$/.test(e.color) ||
      !finite(e.width, 1, 16)
    )
      throw Error("绘图样式无效。");
    if (
      !Array.isArray(e.points) ||
      e.points.length < 1 ||
      e.points.length > DRAWING_POINTS_MAX ||
      (e.kind !== "pen" && e.points.length !== 2)
    )
      throw Error("绘图坐标数量无效。");
    for (const p of e.points)
      if (
        !p ||
        typeof p !== "object" ||
        !finite(p.x, 0, block.width) ||
        !finite(p.y, 0, block.height)
      )
        throw Error("绘图坐标超出画布范围。");
  }
}
