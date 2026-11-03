import type { CanvasBlock, CanvasDocument, CanvasAsset } from "./document";
import { validateDrawing, type DrawingBlock } from "./drawing";

export interface EmbeddedCanvasBlock {
  id: string;
  type: "canvas";
  scene: CanvasDocument;
}
export function emptyCanvasScene(id: string): CanvasDocument {
  return {
    schema: "nomi-document-ir/draft-1",
    id,
    title: "画布",
    revision: 1,
    notes: [],
    blocks: [],
    assets: [],
    board: { id: "board.embedded", placements: [], connectors: [] },
  };
}
/** Local scenes keep their own identities; binary asset identities belong to the library. */
export function blockAssetIds(block: CanvasBlock): string[] {
  return block.type === "canvas"
    ? block.scene.assets.map((a) => a.id)
    : "asset" in block
      ? [block.asset]
      : [];
}
export function remapCanvasAssets(
  block: CanvasBlock,
  map: (id: string) => string,
): CanvasBlock {
  if (block.type !== "canvas")
    return "asset" in block ? { ...block, asset: map(block.asset) } : block;
  return {
    ...block,
    scene: {
      ...block.scene,
      assets: block.scene.assets.map((a) => ({ ...a, id: map(a.id) })),
      notes: block.scene.notes.map((n) => ({
        ...n,
        ...(n.icon?.type === "image"
          ? { icon: { ...n.icon, asset: map(n.icon.asset) } }
          : {}),
      })),
      blocks: block.scene.blocks.map((b) => remapCanvasAssets(b, map)),
    },
  };
}
export function mergeCanvasAssets(
  existing: CanvasAsset[],
  incoming: CanvasAsset[],
): CanvasAsset[] {
  const result = [...existing];
  for (const a of incoming) {
    const previous = result.find((p) => p.id === a.id);
    if (
      previous &&
      (previous.sha256 !== a.sha256 ||
        previous.mime !== a.mime ||
        previous.bytes !== a.bytes)
    )
      throw Error("画布附件身份冲突。");
    if (!previous) result.push(a);
  }
  return result;
}
/** Preserve the unreleased inline drawing prototype when opening its local drafts. */
export function migrateInlineDrawing(
  raw: Record<string, any>,
): EmbeddedCanvasBlock {
  validateDrawing(raw as DrawingBlock);
  const scene = emptyCanvasScene("document.embedded");
  raw.elements.forEach((e: DrawingBlock["elements"][number], i: number) => {
    const a = e.points[0],
      b = e.points.at(-1)!,
      id = `object.${i}`;
    if (e.kind === "line" || e.kind === "arrow") {
      scene.board.connectors!.push({
        id,
        from: { point: a, side: "e" },
        to: { point: b, side: "w" },
        routing: "straight",
        style: "solid",
        startArrow: false,
        endArrow: e.kind === "arrow",
        label: "",
        color: e.color,
        width: Math.min(8, e.width),
      });
    } else if (e.kind === "rectangle" || e.kind === "ellipse") {
      scene.blocks.push({
        id,
        type: "shape",
        shape: e.kind,
        text: "",
        tone: "neutral",
        shapeStyle: {
          fill: "none",
          stroke: e.color,
          strokeWidth: Math.min(8, e.width),
        },
      });
      scene.board.placements.push({
        id: `place.${i}`,
        content: id,
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.max(16, Math.abs(a.x - b.x)),
        height: Math.max(16, Math.abs(a.y - b.y)),
      });
    } else {
      const x = Math.max(0, Math.min(...e.points.map((p) => p.x)) - 12),
        y = Math.max(0, Math.min(...e.points.map((p) => p.y)) - 12);
      const width = Math.min(
          1600,
          Math.max(160, Math.max(...e.points.map((p) => p.x)) - x + 12),
        ),
        height = Math.min(
          1200,
          Math.max(120, Math.max(...e.points.map((p) => p.y)) - y + 12),
        );
      scene.blocks.push({
        id,
        type: "drawing",
        width,
        height,
        elements: [
          { ...e, points: e.points.map((p) => ({ x: p.x - x, y: p.y - y })) },
        ],
      });
      scene.board.placements.push({
        id: `place.${i}`,
        content: id,
        x,
        y,
        width,
        height,
      });
    }
  });
  const { width: _width, height: _height, elements: _elements, ...extra } = raw;
  return { ...extra, id: raw.id, type: "canvas", scene };
}
