import { useId } from "react";
import {
  CANVAS_HEADS,
  canvasConnectorGeometry,
  canvasConnectorPaintGeometry,
  canvasHeadRefX,
  canvasEndpointPoint,
  canvasConnectorPath,
  reconnectCanvasEndpoint,
  canvasCrossings,
  type CanvasConnector,
  type CanvasEndpoint,
  type CanvasGuide,
  type CanvasRect,
  type CanvasPoint,
} from "@nomi/core";
import { HeadShape } from "./ConnectorSymbols";
export interface ConnectionDraft {
  from: CanvasEndpoint;
  point: CanvasPoint;
  target: CanvasEndpoint | null;
  reconnect?: { id: string; end: "from" | "to" };
  dragged?: boolean;
  preview?: CanvasConnector;
  selfArmed?: boolean;
}
export function CanvasConnections({
  rectangles,
  connectors,
  selected,
  draft,
  zoom,
  guides,
  onSelect,
  onReconnect,
  onSegment,
  onEditLabel,
}: {
  rectangles: CanvasRect[];
  connectors: CanvasConnector[];
  selected: string | null;
  draft: ConnectionDraft | null;
  zoom: number;
  guides: CanvasGuide[];
  onSelect: (id: string) => void;
  onReconnect: (
    event: React.PointerEvent,
    connector: CanvasConnector,
    end: "from" | "to",
  ) => void;
  onSegment: (
    event: React.PointerEvent,
    connector: CanvasConnector,
    index: number,
  ) => void;
  onEditLabel: (id: string) => void;
}) {
  const marker = "head" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const geometries = connectors.map((original) => {
    const c =
      draft?.reconnect?.id === original.id && draft.dragged
        ? (draft.preview ??
          reconnectCanvasEndpoint(
            original,
            draft.reconnect.end,
            draft.point,
            draft.target,
            rectangles,
          ))
        : original;
    return {
      c,
      path: canvasConnectorGeometry(c, rectangles),
      paint: canvasConnectorPaintGeometry(c, rectangles, zoom),
    };
  });
  const find = (e: CanvasEndpoint) => canvasEndpointPoint(e, rectangles);
  const visible = geometries;
  const curves = visible.map(({ c, path, paint }) => {
    if (!path || !paint) return null;
    const start = c.startHead ?? (c.startArrow ? "arrow" : "none"),
      end = c.endHead ?? (c.endArrow ? "arrow" : "none"),
      color = c.color ?? "var(--text)",
      width = c.width ?? 2;
    const style = c.labelStyle ?? {};
    const jumps = c.lineJumps
      ? canvasCrossings(
          path.points,
          geometries
            .filter((g) => g.c.id !== c.id && g.path)
            .map((g) => g.path!.points),
        )
      : [];
    return (
      <g
        key={c.id}
        data-connector={c.id}
        data-connector-preview={
          draft?.reconnect?.id === c.id ? "reconnect" : undefined
        }
        className={selected === c.id ? "is-selected" : undefined}
      >
        <path
          className="canvas-connection-hit"
          d={path.d}
          strokeWidth={Math.max(14, width + 8) / zoom}
          tabIndex={0}
          role="button"
          aria-label={`选择连接 ${c.label || "未命名"}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect(c.id);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEditLabel(c.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(c.id);
            }
          }}
        />
        <path
          className="canvas-connection-line"
          d={paint.d}
          style={{ stroke: color }}
          strokeWidth={width}
          opacity={c.opacity ?? 1}
          vectorEffect="non-scaling-stroke"
          strokeDasharray={
            c.style === "dashed"
              ? "8 6"
              : c.style === "dotted"
                ? "1 5"
                : undefined
          }
          markerStart={
            start !== "none" ? `url(#${marker}-${start})` : undefined
          }
          markerEnd={end !== "none" ? `url(#${marker}-${end})` : undefined}
        />
        {jumps.map((p, i) => {
          const near = path.points.findIndex(
            (v, j) =>
              j > 0 &&
              Math.min(v.x, path.points[j - 1].x) <= p.x + 1 &&
              Math.max(v.x, path.points[j - 1].x) >= p.x - 1 &&
              Math.min(v.y, path.points[j - 1].y) <= p.y + 1 &&
              Math.max(v.y, path.points[j - 1].y) >= p.y - 1,
          );
          const vertical =
            near > 0 &&
            Math.abs(path.points[near].y - path.points[near - 1].y) >
              Math.abs(path.points[near].x - path.points[near - 1].x);
          const r = 7 / zoom;
          return (
            <g
              key={i}
              data-line-jump="true"
              pointerEvents="none"
              opacity={c.opacity ?? 1}
            >
              <circle cx={p.x} cy={p.y} r={r} fill="var(--surface-muted)" />
              <path
                d={
                  vertical
                    ? `M ${p.x} ${p.y - r} Q ${p.x + r * 1.7} ${p.y} ${p.x} ${p.y + r}`
                    : `M ${p.x - r} ${p.y} Q ${p.x} ${p.y - r * 1.7} ${p.x + r} ${p.y}`
                }
                stroke={color}
                strokeWidth={width}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
            </g>
          );
        })}
        {c.label && (
          <text
            className="canvas-connection-label"
            x={path.label.x}
            y={path.label.y}
            textAnchor={
              style.align === "left"
                ? "start"
                : style.align === "right"
                  ? "end"
                  : "middle"
            }
            dominantBaseline="middle"
            style={{
              fill: style.color ?? "var(--text)",
              fontSize: style.size ?? 14,
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? "italic" : undefined,
              textDecoration: [
                style.underline ? "underline" : "",
                style.strike ? "line-through" : "",
              ].join(" "),
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(c.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onEditLabel(c.id);
            }}
          >
            {style.link ? (
              <a
                href={style.link}
                target="_blank"
                rel="noreferrer"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {c.label}
              </a>
            ) : (
              c.label
            )}
          </text>
        )}
      </g>
    );
  });
  return (
    <>
      <svg className="canvas-connection-layer" aria-label="画布连接线">
        <defs>
          {CANVAS_HEADS.filter((h) => h !== "none").map((head) => (
            <marker
              key={head}
              id={`${marker}-${head}`}
              viewBox="0 0 16 16"
              refX={canvasHeadRefX(head)}
              refY="8"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
              <g
                stroke="context-stroke"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <HeadShape head={head} />
              </g>
            </marker>
          ))}
        </defs>
        {curves.filter((_, i) => !visible[i].c.aboveShapes)}
        {draft &&
          !draft.reconnect &&
          (() => {
            const a = find(draft.from),
              b = draft.target ? find(draft.target) : draft.point;
            return a && b ? (
              <path
                className="canvas-connection-preview"
                d={
                  (draft.preview
                    ? canvasConnectorPaintGeometry(
                        draft.preview,
                        rectangles,
                        zoom,
                      )!
                    : canvasConnectorPath(
                        a,
                        b,
                        draft.from.side,
                        draft.target?.side ?? "w",
                        "rounded",
                        undefined,
                        {
                          from: rectangles.find(
                            (r) => r.id === draft.from.placement,
                          ),
                          to: rectangles.find(
                            (r) => r.id === draft.target?.placement,
                          ),
                        },
                      )
                  ).d
                }
                vectorEffect="non-scaling-stroke"
                markerEnd={`url(#${marker}-arrow)`}
              />
            ) : null;
          })()}
      </svg>
      <svg
        className="canvas-connection-layer canvas-connection-front-layer"
        aria-label="上层连接线"
      >
        {curves.filter((_, i) => visible[i].c.aboveShapes)}
      </svg>
      <svg className="canvas-connection-controls" aria-label="连接端点">
        {geometries
          .filter(({ c }) => c.id === selected)
          .map(({ c, path }) => (
            <g key={c.id}>
              {(["from", "to"] as const).map((end) => {
                const p = find(c[end]);
                return p ? (
                  <circle
                    key={end}
                    className="canvas-connection-endpoint"
                    cx={p.x}
                    cy={p.y}
                    r={5 / zoom}
                    data-reconnect={end}
                    role="button"
                    aria-label={`改接${end === "from" ? "起点" : "终点"}`}
                    aria-disabled={!!c.locked}
                    onPointerDown={(e) => {
                      if (!c.locked) onReconnect(e, c, end);
                    }}
                  />
                ) : null;
              })}
              {!c.locked &&
                draft?.reconnect?.id !== c.id &&
                path &&
                (c.routing === "rounded" || c.routing === "elbow") &&
                path.points.slice(1).map((p, i) => {
                  const prev = path.points[i],
                    vertical = Math.abs(p.y - prev.y) > Math.abs(p.x - prev.x);
                  if (
                    Math.hypot(p.x - prev.x, p.y - prev.y) <
                    Math.max(
                      20 / zoom,
                      i === 0 || i === path.points.length - 2 ? 48 : 16,
                    )
                  )
                    return null;
                  return (
                    <rect
                      key={i}
                      data-segment={i}
                      className="canvas-connection-segment"
                      x={(p.x + prev.x) / 2 - (vertical ? 3 : 7) / zoom}
                      y={(p.y + prev.y) / 2 - (vertical ? 7 : 3) / zoom}
                      width={(vertical ? 6 : 14) / zoom}
                      height={(vertical ? 14 : 6) / zoom}
                      rx={3 / zoom}
                      style={{ cursor: vertical ? "ew-resize" : "ns-resize" }}
                      role="button"
                      aria-label={`调整连线段 ${i + 1}`}
                      onPointerDown={(e) => onSegment(e, c, i)}
                    />
                  );
                })}
            </g>
          ))}
        {draft?.target?.anchor &&
          (() => {
            const p = find(draft.target);
            return p ? (
              <circle
                className="canvas-connection-boundary-anchor"
                data-boundary-anchor={draft.target.placement}
                cx={p.x}
                cy={p.y}
                r={5 / zoom}
                vectorEffect="non-scaling-stroke"
              />
            ) : null;
          })()}
      </svg>
      <svg className="canvas-guides" aria-hidden="true">
        {guides.map((g, i) =>
          g.kind ? (
            <g key={i} className="canvas-measure" data-measure-guide={g.kind}>
              <line
                x1={g.axis === "x" ? g.from : g.position}
                x2={g.axis === "x" ? g.to : g.position}
                y1={g.axis === "y" ? g.from : g.position}
                y2={g.axis === "y" ? g.to : g.position}
                vectorEffect="non-scaling-stroke"
              />
              {[g.from, g.to].map((v, j) => (
                <line
                  key={j}
                  x1={g.axis === "x" ? v : g.position - 4 / zoom}
                  x2={g.axis === "x" ? v : g.position + 4 / zoom}
                  y1={g.axis === "y" ? v : g.position - 4 / zoom}
                  y2={g.axis === "y" ? v : g.position + 4 / zoom}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <text
                x={g.axis === "x" ? (g.from + g.to) / 2 : g.position + 8 / zoom}
                y={g.axis === "y" ? (g.from + g.to) / 2 : g.position - 6 / zoom}
                fontSize={10 / zoom}
                style={{ strokeWidth: 3 / zoom }}
              >
                {Math.round(g.value ?? g.to - g.from)}
              </text>
            </g>
          ) : (
            <line
              key={i}
              data-snap-guide={g.axis}
              x1={g.axis === "x" ? g.position : g.from}
              x2={g.axis === "x" ? g.position : g.to}
              y1={g.axis === "y" ? g.position : g.from}
              y2={g.axis === "y" ? g.position : g.to}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </svg>
    </>
  );
}
