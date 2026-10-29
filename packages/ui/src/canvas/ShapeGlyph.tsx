import {
  canvasShapePolygon,
  canvasShapePaths,
  type CanvasShape,
  type CanvasShapeStyle,
} from "@nomi/core";
export function ShapeGlyph({
  shape,
  style = {},
}: {
  shape: CanvasShape;
  style?: CanvasShapeStyle;
}) {
  const points = canvasShapePolygon(shape, style);
  if (points)
    return <polygon points={points.map((p) => `${p.x},${p.y}`).join(" ")} />;
  const transform = `translate(50 50) rotate(${style.rotation ?? 0}) scale(${style.flipX ? -1 : 1} ${style.flipY ? -1 : 1}) translate(-50 -50)`;
  return (
    <g transform={transform}>
      {shape === "ellipse" ? (
        <ellipse cx="50" cy="50" rx="50" ry="50" />
      ) : shape === "text" ? (
        <rect
          width="100"
          height="100"
          style={{ fill: "none", stroke: "none" }}
        />
      ) : canvasShapePaths[shape] ? (
        <path
          d={canvasShapePaths[shape]}
          style={shape.startsWith("brace") ? { fill: "none" } : undefined}
        />
      ) : (
        <rect
          width="100"
          height="100"
          rx={shape === "rounded-rectangle" ? 8 : 0}
        />
      )}
    </g>
  );
}
