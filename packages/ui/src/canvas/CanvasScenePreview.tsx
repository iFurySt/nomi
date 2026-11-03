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
}: {
  scene: CanvasDocument;
  content: (id: string) => ReactNode;
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
  const scale = Math.min(1, width / sceneWidth, 640 / sceneHeight);
  const height = empty ? 160 : Math.max(120, sceneHeight * scale);
  return (
    <div
      className="embedded-canvas-preview"
      ref={host}
      style={{ height }}
      data-scene-width={sceneWidth}
      data-scene-height={sceneHeight}
    >
      {empty ? (
        <span className="embedded-canvas-empty">双击开始绘制</span>
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
