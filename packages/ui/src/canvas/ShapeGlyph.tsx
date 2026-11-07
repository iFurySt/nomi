import {
  canvasShapePolygon,
  canvasShapePath,
  localSize,
  type CanvasShapeSize,
  type CanvasShape,
  type CanvasShapeStyle,
} from "@nomi/core";
export function ShapeGlyph({
  shape,
  style = {},
  size,
}: {
  shape: CanvasShape;
  style?: CanvasShapeStyle;
  size?: CanvasShapeSize;
}) {
  const icon = !size && (shape === "rounded-rectangle" || shape === "stadium");
  const points = canvasShapePolygon(shape, style);
  const path = canvasShapePath(
    shape,
    localSize(size ?? (icon ? { width: 100, height: 66 } : undefined), style),
  );
  if (points)
    return <polygon points={points.map((p) => `${p.x},${p.y}`).join(" ")} />;
  const transform = `translate(50 50) rotate(${style.rotation ?? 0}) scale(${style.flipX ? -1 : 1} ${style.flipY ? -1 : 1}) translate(-50 -50)`;
  return (
    <g transform={icon ? "translate(0 17) scale(1 .66)" : undefined}>
      <g transform={transform}>
        {shape === "ellipse" ? (
          <ellipse cx="50" cy="50" rx="50" ry="50" />
        ) : shape === "text" ? (
          <rect
            width="100"
            height="100"
            style={{ fill: "none", stroke: "none" }}
          />
        ) : path ? (
          <path
            d={path}
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
    </g>
  );
}
