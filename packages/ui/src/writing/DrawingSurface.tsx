import type { DrawingBlock, DrawingElement } from "@nomi/core";

function DrawingMark({ element: e }: { element: DrawingElement }) {
  const a = e.points[0],
    b = e.points.at(-1)!;
  if (e.kind === "rectangle")
    return (
      <rect
        x={Math.min(a.x, b.x)}
        y={Math.min(a.y, b.y)}
        width={Math.abs(a.x - b.x)}
        height={Math.abs(a.y - b.y)}
      />
    );
  if (e.kind === "ellipse")
    return (
      <ellipse
        cx={(a.x + b.x) / 2}
        cy={(a.y + b.y) / 2}
        rx={Math.abs(a.x - b.x) / 2}
        ry={Math.abs(a.y - b.y) / 2}
      />
    );
  if (e.kind === "pen") {
    if (e.points.length === 1)
      return (
        <circle
          cx={a.x}
          cy={a.y}
          r={e.width / 2}
          fill={e.color}
          stroke="none"
        />
      );
    return <polyline points={e.points.map((p) => `${p.x},${p.y}`).join(" ")} />;
  }
  const angle = Math.atan2(b.y - a.y, b.x - a.x),
    size = 10 + e.width * 2;
  return (
    <>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {e.kind === "arrow" && (
        <path
          d={`M ${b.x - size * Math.cos(angle - Math.PI / 6)} ${b.y - size * Math.sin(angle - Math.PI / 6)} L ${b.x} ${b.y} L ${b.x - size * Math.cos(angle + Math.PI / 6)} ${b.y - size * Math.sin(angle + Math.PI / 6)}`}
        />
      )}
    </>
  );
}
export function DrawingMarks({ elements }: { elements: DrawingElement[] }) {
  return elements.map((e) => (
    <g
      key={e.id}
      data-drawing-element={e.id}
      stroke={e.color}
      strokeWidth={e.width}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <DrawingMark element={e} />
    </g>
  ));
}
export function DrawingSurface({ block }: { block: DrawingBlock }) {
  return (
    <svg
      className="drawing-preview"
      viewBox={`0 0 ${block.width} ${block.height}`}
      role="img"
      aria-label="画布绘图"
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        aspectRatio: `${block.width} / ${block.height}`,
        background: "#ffffff",
        borderRadius: 8,
      }}
    >
      <DrawingMarks elements={block.elements} />
    </svg>
  );
}
