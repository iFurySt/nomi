import {
  type CanvasDocument,
  type CanvasCamera,
  type CanvasPoint,
} from "@nomi/core";
import type { CanvasRepository } from "@nomi/platform";
import { CanvasContent } from "./CanvasContent";
import { CanvasConnections } from "./CanvasConnections";

/** Transient scene in canvas coordinates. Never writes partial model output. */
export function CanvasGenerationPreview({
  scene,
  camera,
  origin,
  repository,
}: {
  scene: CanvasDocument;
  camera: CanvasCamera;
  origin: CanvasPoint;
  repository: CanvasRepository;
}) {
  const rects = scene.board.placements.map((p) => {
    const block = scene.blocks.find((b) => b.id === p.content);
    return {
      ...p,
      height: p.height ?? 240,
      ...(block?.type === "shape"
        ? { shape: block.shape, shapeStyle: block.shapeStyle }
        : {}),
    };
  });
  return (
    <div
      className="canvas-generation-layer"
      aria-label="正在绘制的内容"
      inert
      style={{
        transform: `translate(${camera.x + origin.x * camera.zoom}px, ${camera.y + origin.y * camera.zoom}px) scale(${camera.zoom})`,
      }}
    >
      <CanvasConnections
        rectangles={rects}
        connectors={scene.board.connectors ?? []}
        selected={null}
        draft={null}
        zoom={camera.zoom}
        guides={[]}
        onSelect={() => {}}
        onReconnect={() => {}}
        onSegment={() => {}}
        onEditLabel={() => {}}
      />
      {scene.board.placements.map((p) => (
        <div
          key={p.id}
          className={`generation-object${scene.blocks.find((b) => b.id === p.content)?.type === "shape" ? " shape-card" : ""}`}
          style={{
            left: p.x,
            top: p.y,
            width: p.width,
            height: p.height ?? 240,
          }}
        >
          <CanvasContent
            document={scene}
            contentId={p.content}
            profile="ai-preview"
            repository={repository}
            editing={false}
            onEdit={() => {}}
            onAttach={() => {}}
            onInteractive={() => {}}
            endGroup={() => {}}
          />
        </div>
      ))}
    </div>
  );
}
