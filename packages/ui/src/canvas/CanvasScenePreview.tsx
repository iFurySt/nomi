import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  canvasConnectorGeometry,
  type CanvasDocument,
  type CanvasRect,
} from "@nomi/core";
import { CanvasConnections } from "./CanvasConnections";
import "./canvas.css";
import "./embedded-canvas.css";

/** The editor's renderers and geometry, cropped to content rather than its saved camera. */
export function CanvasScenePreview({
  scene,
  content,
  viewportHeight,
  viewportWidth,
  zoom = 1,
}: {
  scene: CanvasDocument;
  content: (id: string) => ReactNode;
  viewportHeight?: number;
  viewportWidth?: number;
  zoom?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720),
    [heights, setHeights] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => {
      setWidth(node.clientWidth || 720);
      const values = Object.fromEntries(
        [...node.querySelectorAll<HTMLElement>("[data-preview-placement]")].map(
          (el) => [el.dataset.previewPlacement!, el.offsetHeight],
        ),
      );
      setHeights((before) =>
        JSON.stringify(before) === JSON.stringify(values) ? before : values,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node
      .querySelectorAll("[data-preview-placement]")
      .forEach((el) => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [scene]);
  const rects: CanvasRect[] = scene.board.placements.map((p) => {
    const block = scene.blocks.find((b) => b.id === p.content);
    return {
      ...p,
      height: p.height ?? heights[p.id] ?? 240,
      ...(block?.type === "shape"
        ? { shape: block.shape, shapeStyle: block.shapeStyle }
        : {}),
    };
  });
  const points = rects.flatMap((r) => [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
  ]);
  for (const c of scene.board.connectors ?? []) {
    const geometry = canvasConnectorGeometry(c, rects);
    if (geometry) {
      points.push(...geometry.points);
      if (c.label) {
        const size = c.labelStyle?.size ?? 14,
          labelWidth = [...c.label].length * size;
        const left =
          geometry.label.x -
          (c.labelStyle?.align === "left"
            ? 0
            : c.labelStyle?.align === "right"
              ? labelWidth
              : labelWidth / 2);
        points.push(
          { x: left, y: geometry.label.y - size },
          { x: left + labelWidth, y: geometry.label.y + size },
        );
      }
    }
  }
  const empty = !points.length;
  const left = empty ? 0 : Math.min(...points.map((p) => p.x)) - 36;
  const top = empty ? 0 : Math.min(...points.map((p) => p.y)) - 36;
  const sceneWidth = empty
    ? 640
    : Math.max(160, Math.max(...points.map((p) => p.x)) - left + 36);
  const sceneHeight = empty
    ? 160
    : Math.max(100, Math.max(...points.map((p) => p.y)) - top + 36);
  const fit = Math.min(
    1,
    width / sceneWidth,
    (viewportHeight ?? 640) / sceneHeight,
  );
  const scale = fit * zoom;
  const height =
    viewportHeight ?? (empty ? 240 : Math.max(160, sceneHeight * fit));
  return (
    <div
      className="embedded-canvas-preview"
      ref={host}
      style={{
        height,
        ...(viewportWidth
          ? { width: `${viewportWidth}%`, margin: "0 auto" }
          : {}),
      }}
      data-scene-width={sceneWidth}
      data-scene-height={sceneHeight}
    >
      {empty ? (
        <div className="embedded-canvas-empty">
          <svg
            width="88"
            height="72"
            viewBox="0 0 88 72"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="19"
              y="10"
              width="53"
              height="47"
              rx="7"
              fill="var(--canvas)"
              stroke="currentColor"
              opacity=".3"
            />
            <rect
              x="12"
              y="16"
              width="53"
              height="47"
              rx="7"
              fill="var(--canvas)"
              stroke="currentColor"
              opacity=".6"
            />
            <path
              d="m20 51 12-13 10 10 8-7 8 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="49" cy="30" r="4" fill="currentColor" opacity=".4" />
            <path
              d="M9 31 5 27m68 26 7 3M67 9l3-5"
              stroke="var(--accent, #527bff)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>画布暂无内容</span>
        </div>
      ) : (
        <div className="embedded-canvas-picture" inert aria-hidden="true">
          <div
            className="embedded-canvas-world"
            style={{
              left: (width - sceneWidth * scale) / 2,
              top: (height - sceneHeight * scale) / 2,
              width: sceneWidth,
              height: sceneHeight,
              transform: `scale(${scale}) translate(${-left}px, ${-top}px)`,
            }}
          >
            <CanvasConnections
              rectangles={rects}
              connectors={scene.board.connectors ?? []}
              selected={null}
              draft={null}
              zoom={1}
              guides={[]}
              onSelect={() => {}}
              onReconnect={() => {}}
              onSegment={() => {}}
              onEditLabel={() => {}}
            />
            {rects.map((p) => {
              const block = scene.blocks.find((b) => b.id === p.content),
                note = scene.notes.find((n) => n.id === p.content);
              return (
                <div
                  key={p.id}
                  data-preview-placement={p.id}
                  className={`canvas-card embedded-canvas-object ${block?.type === "shape" ? "shape-card" : ""} ${block?.type === "interactive" ? "interactive-card" : ""} ${p.height !== undefined ? "is-sized" : ""}`}
                  style={{
                    left: p.x,
                    top: p.y,
                    width: p.width,
                    height: scene.board.placements.find((r) => r.id === p.id)
                      ?.height,
                  }}
                >
                  {note?.title && (
                    <div className="canvas-card-header">
                      <strong>{note.title}</strong>
                    </div>
                  )}
                  <div className="canvas-card-body">{content(p.content)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
