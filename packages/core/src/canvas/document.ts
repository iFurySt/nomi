import { noteSubtreeIds } from "./note-tree";
import { parseInteractiveProgram } from "../interactive/validate";
import { temperatureProgram } from "../interactive/index";
import type { InteractiveProgram } from "../interactive/types";
export type NoteIcon =
  { type: "emoji"; value: string } | { type: "image"; asset: string };
const emojiSegments = new Intl.Segmenter("en", { granularity: "grapheme" });
export interface CanvasNote {
  id: string;
  title: string;
  parentId?: string;
  icon?: NoteIcon;
  blocks: string[];
}
export const CANVAS_SHAPES = [
  "rectangle",
  "rounded-rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "right-triangle",
  "parallelogram",
  "trapezoid",
  "hexagon",
  "pentagon",
  "octagon",
  "star",
  "cylinder",
  "cube",
  "chevron",
  "arrow-left",
  "arrow-right",
  "arrow-both",
  "cross",
  "cloud",
  "speech-bubble",
  "callout",
  "brace-left",
  "brace-right",
  "document",
  "text",
] as const;
export type CanvasShape = (typeof CANVAS_SHAPES)[number];
export interface CanvasShapeStyle {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  rotation?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  text?: CanvasLabelStyle & {
    verticalAlign?: "top" | "middle" | "bottom";
    rotate?: boolean;
    list?: "none" | "bullet" | "number" | "quote";
  };
}
export type CanvasBlock =
  | { id: string; type: "markdown"; source: string }
  | {
      id: string;
      type: "shape";
      shape: CanvasShape;
      text: string;
      tone: "neutral" | "sage" | "sand" | "blue";
      shapeStyle?: CanvasShapeStyle;
    }
  | { id: string; type: "interactive"; program: InteractiveProgram }
  | { id: string; type: "image"; asset: string; caption?: string }
  | { id: string; type: "file"; asset: string };
export interface CanvasAsset {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  sha256: string;
  width?: number;
  height?: number;
}
export interface Placement {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  /** Omitted for content-driven height (including existing documents). */
  height?: number;
  locked?: boolean;
  group?: string;
}
export interface CanvasDocument {
  schema: "nomi-document-ir/draft-1";
  id: string;
  title: string;
  revision: number;
  notes: CanvasNote[];
  blocks: CanvasBlock[];
  assets: CanvasAsset[];
  board: {
    id: string;
    placements: Placement[];
    connectors?: CanvasConnector[];
  };
}
export type CanvasSide = "n" | "e" | "s" | "w";
export interface CanvasPoint {
  x: number;
  y: number;
}
export type CanvasEndpoint =
  | { placement: string; side: CanvasSide; anchor?: CanvasPoint; point?: never }
  | { point: CanvasPoint; side: CanvasSide; placement?: never; anchor?: never };
export const CANVAS_HEADS = [
  "none",
  "arrow",
  "triangle",
  "triangle-open",
  "diamond",
  "diamond-open",
  "circle",
  "circle-open",
  "bar",
  "crowfoot",
  "crowfoot-bar",
  "crowfoot-circle",
  "circle-bar",
  "cross",
] as const;
export type CanvasHead = (typeof CANVAS_HEADS)[number];
export interface CanvasLabelStyle {
  color?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: "left" | "center" | "right";
  link?: string;
}
export interface CanvasConnector {
  id: string;
  from: CanvasEndpoint;
  to: CanvasEndpoint;
  routing: "curve" | "elbow" | "rounded" | "straight";
  style: "solid" | "dashed" | "dotted";
  startArrow: boolean;
  endArrow: boolean;
  label: string;
  startHead?: CanvasHead;
  endHead?: CanvasHead;
  color?: string;
  opacity?: number;
  width?: number;
  aboveShapes?: boolean;
  lineJumps?: boolean;
  locked?: boolean;
  waypoints?: CanvasPoint[];
  labelStyle?: CanvasLabelStyle;
}
export interface CanvasCamera {
  x: number;
  y: number;
  zoom: number;
}
export const CANVAS_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const CANVAS_ASSET_BYTES = 20 * 1024 * 1024;
const bad = (message: string): never => {
  throw Error(message);
};
const record = (v: unknown): Record<string, any> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) bad("应为对象。");
  return v as Record<string, any>;
};
const list = (v: unknown, max = 200): any[] => {
  if (!Array.isArray(v) || v.length > max) bad("对象数量超出画布上限。");
  return v as any[];
};
const text = (v: unknown, max: number) => {
  if (typeof v !== "string" || v.length > max) bad("文本过长或类型错误。");
};
const id = (v: unknown) => {
  if (
    typeof v !== "string" ||
    !/^[a-zA-Z][\w.-]{0,95}$/.test(v) ||
    ["constructor", "prototype", "__proto__"].includes(v)
  )
    bad("对象标识无效。");
};
const finite = (v: unknown, lo: number, hi: number) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
    bad("坐标或尺寸超出范围。");
};
/** Shared JSON safety budget; extension fields never become executable capabilities. */
export function validateDocumentJSON(
  raw: unknown,
  maxBytes = CANVAS_DOCUMENT_BYTES,
): void {
  // Reject non-JSON values / unsafe keys before cloning or interpreting nested programs.
  let visited = 0;
  const json = (v: unknown, depth = 0): void => {
    if (depth > 48 || ++visited > 40000) bad("文档嵌套或对象数量过大。");
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) bad("文档中存在无效数字。");
      return;
    }
    if (Array.isArray(v)) {
      if (v.length > 2048) bad("数组过长。");
      v.forEach((x) => json(x, depth + 1));
      return;
    }
    const o = record(v);
    if (![Object.prototype, null].includes(Object.getPrototypeOf(o)))
      bad("仅接受 JSON 数据。");
    for (const [k, x] of Object.entries(o)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        bad("不安全的字段。");
      json(x, depth + 1);
    }
  };
  json(raw);
  if (new TextEncoder().encode(JSON.stringify(raw)).length > maxBytes)
    bad("文档超过 JSON 大小限制。");
}
export function parseCanvasDocument(raw: unknown): CanvasDocument {
  return validateCanvasDocument(raw, true);
}
function validateCanvasDocument(raw: unknown, clone: boolean): CanvasDocument {
  if (typeof raw === "string") {
    if (raw.length > CANVAS_DOCUMENT_BYTES) bad("文档超过 2 MiB。");
    try {
      raw = JSON.parse(raw);
    } catch {
      bad("文档不是合法 JSON。");
    }
  }
  validateDocumentJSON(raw);
  // Additive fields are opaque data: retain them for forward-compatible saves.
  const p = record(raw);
  if (p.schema !== "nomi-document-ir/draft-1")
    bad("不支持此文档版本，原内容保持不变。");
  id(p.id);
  text(p.title, 200);
  if (!Number.isSafeInteger(p.revision) || p.revision < 1)
    bad("文档 revision 无效。");
  const ids = new Set<string>();
  const identity = (value: unknown) => {
    id(value);
    if (ids.has(value as string)) bad("对象 ID 重复。");
    ids.add(value as string);
  };
  identity(p.id);
  const assets = list(p.assets, 64);
  const assetIds = new Set<string>();
  for (const a of assets) {
    const asset = record(a);
    identity(asset.id);
    assetIds.add(asset.id);
    text(asset.name, 255);
    text(asset.mime, 128);
    if (!Number.isInteger(asset.bytes)) bad("附件长度无效。");
    finite(asset.bytes, 0, CANVAS_ASSET_BYTES);
    if (!/^[a-f0-9]{64}$/.test(asset.sha256)) bad("附件摘要无效。");
    if (asset.width !== undefined) finite(asset.width, 1, 32768);
    if (asset.height !== undefined) finite(asset.height, 1, 32768);
  }
  const blocks = list(p.blocks);
  const contentIds = new Set<string>();
  for (const entry of blocks) {
    const b = record(entry);
    identity(b.id);
    contentIds.add(b.id);
    if (b.type === "markdown") {
      text(b.source, 200000);
    } else if (b.type === "shape") {
      if (
        !CANVAS_SHAPES.includes(b.shape) ||
        !["neutral", "sage", "sand", "blue"].includes(b.tone)
      )
        bad("形状样式无效。");
      text(b.text, 4000);
      if (b.shapeStyle !== undefined) {
        const s = record(b.shapeStyle);
        for (const k of ["fill", "stroke"])
          if (
            s[k] !== undefined &&
            s[k] !== "none" &&
            !/^#[a-fA-F0-9]{6}$/.test(s[k])
          )
            bad("形状颜色无效。");
        for (const k of ["fillOpacity", "strokeOpacity"])
          if (s[k] !== undefined) finite(s[k], 0, 1);
        if (s.strokeWidth !== undefined) finite(s.strokeWidth, 0, 8);
        if (
          s.strokeStyle !== undefined &&
          !["solid", "dashed", "dotted"].includes(s.strokeStyle)
        )
          bad("形状线型无效。");
        if (s.rotation !== undefined && ![0, 90, 180, 270].includes(s.rotation))
          bad("形状旋转无效。");
        for (const k of ["flipX", "flipY"])
          if (s[k] !== undefined && typeof s[k] !== "boolean")
            bad("形状翻转无效。");
        if (s.text !== undefined) {
          const t = record(s.text);
          if (t.color !== undefined && !/^#[a-fA-F0-9]{6}$/.test(t.color))
            bad("形状文字颜色无效。");
          if (t.size !== undefined) finite(t.size, 10, 96);
          for (const k of ["bold", "italic", "underline", "strike", "rotate"])
            if (t[k] !== undefined && typeof t[k] !== "boolean")
              bad("形状文字样式无效。");
          if (
            t.align !== undefined &&
            !["left", "center", "right"].includes(t.align)
          )
            bad("文字对齐无效。");
          if (
            t.verticalAlign !== undefined &&
            !["top", "middle", "bottom"].includes(t.verticalAlign)
          )
            bad("文字垂直对齐无效。");
          if (
            t.list !== undefined &&
            !["none", "bullet", "number", "quote"].includes(t.list)
          )
            bad("文字列表无效。");
          if (t.link !== undefined) {
            text(t.link, 2048);
            if (t.link && !/^https?:\/\/[^\s]+$/.test(t.link))
              bad("链接仅支持 HTTP / HTTPS。");
          }
        }
      }
    } else if (b.type === "interactive") {
      parseInteractiveProgram(b.program);
    } else if (b.type === "image" || b.type === "file") {
      if (b.caption !== undefined) text(b.caption, 2000);
      if (!assetIds.has(b.asset)) bad("附件引用不存在。");
      if (
        b.type === "image" &&
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          assets.find((a) => a.id === b.asset).mime,
        )
      )
        bad("图片格式不支持安全预览。");
    } else bad("不支持此内容类型，不能丢弃后保存。");
  }
  const notes = list(p.notes, 100);
  for (const entry of notes) {
    const n = record(entry);
    if (n.icon !== undefined) {
      const icon = record(n.icon);
      if (icon.type === "emoji") {
        text(icon.value, 64);
        if (
          Array.from(emojiSegments.segment(icon.value)).length !== 1 ||
          !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(
            icon.value,
          )
        )
          bad("文稿图标需要一个 Emoji。");
      } else if (icon.type === "image") {
        const asset = assets.find((a) => a.id === icon.asset);
        if (
          !asset ||
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            asset.mime,
          )
        )
          bad("文稿图标图片引用无效。");
      } else bad("不支持此文稿图标类型。");
    }
    if (n.parentId !== undefined) id(n.parentId);
    identity(n.id);
    contentIds.add(n.id);
    text(n.title, 200);
    const children = list(n.blocks);
    if (
      new Set(children).size !== children.length ||
      children.some((b) => !blocks.some((x) => x.id === b))
    )
      bad("笔记包含无效或重复内容引用。");
  }
  for (const note of notes) {
    const seen = new Set<string>([note.id]);
    let parent = note.parentId;
    while (parent !== undefined) {
      if (seen.has(parent)) bad("文稿层级不能循环引用。");
      seen.add(parent);
      const ancestor = notes.find((n) => n.id === parent);
      if (!ancestor) bad("父文稿已不存在。");
      parent = ancestor.parentId;
    }
  }
  const board = record(p.board);
  identity(board.id);
  for (const entry of list(board.placements)) {
    const place = record(entry);
    identity(place.id);
    if (!contentIds.has(place.content)) bad("摆放引用不存在。");
    finite(place.x, -1e6, 1e6);
    finite(place.y, -1e6, 1e6);
    const isShape = blocks.some(
      (b) => b.id === place.content && b.type === "shape",
    );
    finite(place.width, isShape ? 16 : 160, 1600);
    if (place.height !== undefined)
      finite(place.height, isShape ? 16 : 120, 2400);
    if (place.locked !== undefined && typeof place.locked !== "boolean")
      bad("锁定状态无效。");
    if (place.group !== undefined) id(place.group);
  }
  if (board.connectors !== undefined)
    for (const entry of list(board.connectors, 400)) {
      const c = record(entry);
      identity(c.id);
      const point = (v: unknown) => {
        const p = record(v);
        finite(p.x, -1e6, 1e6);
        finite(p.y, -1e6, 1e6);
      };
      const color = (v: unknown) => {
        if (typeof v !== "string" || !/^#[a-fA-F0-9]{6}$/.test(v))
          bad("连接颜色无效。");
      };
      for (const endpoint of [c.from, c.to]) {
        const e = record(endpoint);
        if (!["n", "e", "s", "w"].includes(e.side)) bad("连接端点无效。");
        if (e.point !== undefined) {
          if (e.placement !== undefined || e.anchor !== undefined)
            bad("端点不能同时绑定与自由定位。");
          point(e.point);
        } else if (
          !board.placements.some((p: Placement) => p.id === e.placement)
        )
          bad("连接端点无效。");
        if (e.anchor !== undefined) {
          const anchor = record(e.anchor);
          finite(anchor.x, 0, 1);
          finite(anchor.y, 0, 1);
        }
      }
      if (
        !["curve", "elbow", "rounded", "straight"].includes(c.routing) ||
        !["solid", "dashed", "dotted"].includes(c.style) ||
        typeof c.startArrow !== "boolean" ||
        typeof c.endArrow !== "boolean"
      )
        bad("连接样式无效。");
      for (const end of ["startHead", "endHead"])
        if (c[end] !== undefined && !CANVAS_HEADS.includes(c[end]))
          bad("端点标记无效。");
      if (c.color !== undefined) color(c.color);
      if (c.opacity !== undefined) finite(c.opacity, 0, 1);
      if (c.width !== undefined) finite(c.width, 1, 8);
      for (const flag of ["locked", "lineJumps", "aboveShapes"])
        if (c[flag] !== undefined && typeof c[flag] !== "boolean")
          bad("连接开关无效。");
      if (c.waypoints !== undefined) list(c.waypoints, 32).forEach(point);
      if (c.labelStyle !== undefined) {
        const l = record(c.labelStyle);
        if (l.color !== undefined) color(l.color);
        if (l.size !== undefined) finite(l.size, 10, 48);
        for (const flag of ["bold", "italic", "underline", "strike"])
          if (l[flag] !== undefined && typeof l[flag] !== "boolean")
            bad("文字格式无效。");
        if (
          l.align !== undefined &&
          !["left", "center", "right"].includes(l.align)
        )
          bad("文字对齐无效。");
        if (l.link !== undefined) {
          text(l.link, 2048);
          if (l.link && !/^https?:\/\/[^\s]+$/.test(l.link))
            bad("链接仅支持 HTTP / HTTPS。");
        }
      }
      text(c.label, 200);
    }
  return (clone ? structuredClone(p) : p) as CanvasDocument;
}
export type CanvasCommand =
  | {
      type: "create_note";
      note: CanvasNote;
      block: Extract<CanvasBlock, { type: "markdown" }>;
      placement: Placement;
    }
  | { type: "set_markdown"; id: string; source: string }
  | { type: "set_image_caption"; id: string; caption: string }
  | { type: "add_note"; note: CanvasNote }
  | { type: "delete_note"; id: string }
  | { type: "move_note"; id: string; parentId: string | null; before?: string }
  | {
      type: "set_note_icon";
      id: string;
      icon: NoteIcon | null;
      asset?: CanvasAsset;
    }
  | { type: "rename_note"; id: string; title: string }
  | { type: "set_note_blocks"; id: string; blocks: string[] }
  | { type: "set_shape"; block: Extract<CanvasBlock, { type: "shape" }> }
  | { type: "connect"; connector: CanvasConnector }
  | { type: "update_connector"; connector: CanvasConnector }
  | { type: "remove_connector"; id: string }
  | {
      type: "reorder_connector";
      id: string;
      position: "front" | "back" | "forward" | "backward";
    }
  | {
      type: "reorder";
      id: string;
      position: "front" | "back" | "forward" | "backward";
    }
  | {
      type: "set_placement";
      id: string;
      locked?: boolean;
      group?: string | null;
    }
  | { type: "move"; id: string; x: number; y: number }
  | { type: "resize"; id: string; width: number; height?: number }
  | { type: "remove_placement"; id: string }
  | { type: "duplicate_placement"; id: string; newId: string }
  | { type: "place"; placement: Placement }
  | {
      type: "add_block";
      block: CanvasBlock;
      asset?: CanvasAsset;
      placement?: Placement;
      noteId?: string;
    };
/** Atomic local transaction. This revision is not a CRDT frontier or cloud version. */
export function applyCanvasCommands(
  document: CanvasDocument,
  baseRevision: number,
  commands: CanvasCommand[],
): CanvasDocument {
  if (document.revision !== baseRevision)
    bad("文档已经改变，请重新读取后应用。");
  if (!commands.length || commands.length > 600) bad("修改数量无效。");
  // Text edits keep unrelated blocks/programs stable for the renderer and Undo.
  // Still run the full validator, including size limits and embedded programs.
  if (commands.every((command) => command.type === "set_markdown")) {
    const replacements = new Map<string, CanvasBlock>();
    for (const command of commands) {
      const block = document.blocks.find((b) => b.id === command.id);
      if (block?.type !== "markdown") bad("文本块已不存在。");
      replacements.set(command.id, {
        ...block!,
        source: command.source,
      } as CanvasBlock);
    }
    return validateCanvasDocument(
      {
        ...document,
        revision: document.revision + 1,
        blocks: document.blocks.map(
          (block) => replacements.get(block.id) ?? block,
        ),
      },
      false,
    );
  }
  const next = structuredClone(document);
  for (const command of commands) {
    const place = () =>
      next.board.placements.find(
        (p) => p.id === ("id" in command ? command.id : ""),
      ) ?? bad("摆放已不存在。");
    switch (command.type) {
      case "set_shape": {
        const index = next.blocks.findIndex(
          (b) => b.id === command.block.id && b.type === "shape",
        );
        if (index < 0) bad("形状已不存在。");
        next.blocks[index] = command.block;
        break;
      }
      case "connect":
        (next.board.connectors ??= []).push(command.connector);
        break;
      case "update_connector": {
        const index =
          next.board.connectors?.findIndex(
            (c) => c.id === command.connector.id,
          ) ?? -1;
        if (index < 0) bad("连接已不存在。");
        next.board.connectors![index] = command.connector;
        break;
      }
      case "reorder_connector": {
        const links = next.board.connectors ?? [];
        const index = links.findIndex((c) => c.id === command.id);
        if (
          index < 0 ||
          !["front", "back", "forward", "backward"].includes(command.position)
        )
          bad("连接层级无效。");
        const [item] = links.splice(index, 1);
        if (
          command.position === "front" ||
          (command.position === "forward" && index === links.length)
        )
          item.aboveShapes = true;
        if (
          command.position === "back" ||
          (command.position === "backward" && index === 0)
        )
          delete item.aboveShapes;
        const target =
          command.position === "front"
            ? links.length
            : command.position === "back"
              ? 0
              : command.position === "forward"
                ? Math.min(links.length, index + 1)
                : Math.max(0, index - 1);
        links.splice(target, 0, item);
        break;
      }
      case "remove_connector":
        if (!next.board.connectors?.some((c) => c.id === command.id))
          bad("连接已不存在。");
        next.board.connectors = next.board.connectors!.filter(
          (c) => c.id !== command.id,
        );
        break;
      case "reorder": {
        const p = place();
        const index = next.board.placements.indexOf(p);
        if (
          !["front", "back", "forward", "backward"].includes(command.position)
        )
          bad("层级无效。");
        next.board.placements = next.board.placements.filter(
          (p) => p.id !== command.id,
        );
        const to =
          command.position === "front"
            ? next.board.placements.length
            : command.position === "back"
              ? 0
              : command.position === "forward"
                ? Math.min(next.board.placements.length, index + 1)
                : Math.max(0, index - 1);
        next.board.placements.splice(to, 0, p);
        break;
      }
      case "set_placement": {
        const p = place();
        if (command.locked !== undefined) p.locked = command.locked;
        if (command.group === null) delete p.group;
        else if (command.group !== undefined) p.group = command.group;
        break;
      }
      case "create_note":
        next.notes.push(command.note);
        next.blocks.push(command.block);
        next.board.placements.push(command.placement);
        break;
      case "add_note":
        next.notes.push(command.note);
        break;
      case "set_markdown": {
        const b = next.blocks.find((b) => b.id === command.id);
        if (b?.type !== "markdown") bad("文本块已不存在。");
        (b as Extract<CanvasBlock, { type: "markdown" }>).source =
          command.source;
        break;
      }
      case "set_image_caption": {
        const block = next.blocks.find((b) => b.id === command.id);
        if (block?.type !== "image") bad("图片块已不存在。");
        const image = block as Extract<CanvasBlock, { type: "image" }>;
        if (command.caption.trim()) image.caption = command.caption;
        else delete image.caption;
        break;
      }
      case "set_note_icon": {
        const note =
          next.notes.find((n) => n.id === command.id) ?? bad("文稿已不存在。");
        const previous =
          note.icon?.type === "image" ? note.icon.asset : undefined;
        if (command.asset) next.assets.push(command.asset);
        if (command.icon) note.icon = structuredClone(command.icon);
        else delete note.icon;
        if (
          previous &&
          !next.notes.some(
            (n) => n.icon?.type === "image" && n.icon.asset === previous,
          ) &&
          !next.blocks.some((b) => "asset" in b && b.asset === previous)
        )
          next.assets = next.assets.filter((a) => a.id !== previous);
        break;
      }
      case "rename_note": {
        const n =
          next.notes.find((n) => n.id === command.id) ?? bad("笔记已不存在。");
        n.title = command.title;
        break;
      }
      case "move_note": {
        const note =
          next.notes.find((n) => n.id === command.id) ?? bad("文稿已不存在。");
        if (
          command.parentId &&
          noteSubtreeIds(next.notes, note.id).has(command.parentId)
        )
          bad("不能移入自身或子文稿。");
        if (command.parentId === null) delete note.parentId;
        else note.parentId = command.parentId;
        const before =
          command.before && next.notes.find((n) => n.id === command.before);
        if (
          command.before &&
          (!before ||
            before.id === note.id ||
            before.parentId !== note.parentId)
        )
          bad("目标顺序不是同级文稿。");
        next.notes = next.notes.filter((n) => n.id !== note.id);
        const index = before ? next.notes.indexOf(before) : next.notes.length;
        next.notes.splice(index, 0, note);
        break;
      }
      case "delete_note": {
        const note =
          next.notes.find((n) => n.id === command.id) ?? bad("文稿已不存在。");
        const deletedNotes = noteSubtreeIds(next.notes, note.id);
        const deletedBlocks = new Set(
          next.notes
            .filter((n) => deletedNotes.has(n.id))
            .flatMap((n) => n.blocks),
        );
        const placements = new Set(
          next.board.placements
            .filter((p) => deletedNotes.has(p.content))
            .map((p) => p.id),
        );
        const deletedIcons = next.notes
          .filter((n) => deletedNotes.has(n.id))
          .flatMap((n) => (n.icon?.type === "image" ? [n.icon.asset] : []));
        next.notes = next.notes.filter((n) => !deletedNotes.has(n.id));
        next.board.placements = next.board.placements.filter(
          (p) => !placements.has(p.id),
        );
        if (next.board.connectors)
          next.board.connectors = next.board.connectors.filter(
            (c) =>
              !placements.has(c.from.placement ?? "") &&
              !placements.has(c.to.placement ?? ""),
          );
        const retained = new Set([
          ...next.notes.flatMap((n) => n.blocks),
          ...next.board.placements.map((p) => p.content),
        ]);
        const removed = next.blocks.filter(
          (b) => deletedBlocks.has(b.id) && !retained.has(b.id),
        );
        next.blocks = next.blocks.filter(
          (b) => !removed.some((r) => r.id === b.id),
        );
        const candidateAssets = new Set([
          ...deletedIcons,
          ...removed.flatMap((b) => ("asset" in b ? [b.asset] : [])),
        ]);
        next.assets = next.assets.filter(
          (a) =>
            !candidateAssets.has(a.id) ||
            next.blocks.some((b) => "asset" in b && b.asset === a.id) ||
            next.notes.some(
              (n) => n.icon?.type === "image" && n.icon.asset === a.id,
            ),
        );
        break;
      }
      case "set_note_blocks": {
        const note =
          next.notes.find((n) => n.id === command.id) ?? bad("笔记已不存在。");
        note.blocks = [...command.blocks];
        break;
      }
      case "move":
        Object.assign(place(), { x: command.x, y: command.y });
        break;
      case "resize":
        place().width = command.width;
        if (command.height !== undefined) place().height = command.height;
        break;
      case "remove_placement":
        place();
        next.board.placements = next.board.placements.filter(
          (p) => p.id !== command.id,
        );
        if (next.board.connectors)
          next.board.connectors = next.board.connectors.filter(
            (c) =>
              c.from.placement !== command.id && c.to.placement !== command.id,
          );
        break;
      case "duplicate_placement": {
        const p = place();
        next.board.placements.push({
          ...p,
          id: command.newId,
          x: p.x + 48,
          y: p.y + 48,
        });
        break;
      }
      case "place":
        next.board.placements.push(command.placement);
        break;
      case "add_block":
        next.blocks.push(command.block);
        if (command.asset) next.assets.push(command.asset);
        if (command.placement) next.board.placements.push(command.placement);
        if (command.noteId) {
          const n =
            next.notes.find((n) => n.id === command.noteId) ??
            bad("笔记已不存在。");
          n.blocks.push(command.block.id);
        }
        break;
      default:
        bad("未支持的文档命令。");
    }
  }
  next.revision++;
  return parseCanvasDocument(next);
}
export function newCanvasId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
export type CanvasResizeDirection =
  "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
/** World-space delta; the edge opposite the dragged edge remains fixed at limits. */
export function resizeCanvasPlacement(
  placement: Placement,
  measuredHeight: number,
  direction: CanvasResizeDirection,
  dx: number,
  dy: number,
  limits = { minWidth: 160, minHeight: 120, maxWidth: 1600, maxHeight: 2400 },
): Pick<Placement, "x" | "y" | "width" | "height"> {
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));
  const { x, y, width } = placement;
  const height = placement.height ?? measuredHeight;
  const west = direction.includes("w"),
    east = direction.includes("e"),
    north = direction.includes("n"),
    south = direction.includes("s");
  // Coordinates and dimensions are bounded together, preserving the fixed edge.
  const nextWidth = west
    ? clamp(
        width - dx,
        Math.max(limits.minWidth, x + width - 1e6),
        Math.min(limits.maxWidth, x + width + 1e6),
      )
    : east
      ? clamp(width + dx, limits.minWidth, limits.maxWidth)
      : width;
  const nextHeight = north
    ? clamp(
        height - dy,
        Math.max(limits.minHeight, y + height - 1e6),
        Math.min(limits.maxHeight, y + height + 1e6),
      )
    : south
      ? clamp(height + dy, limits.minHeight, limits.maxHeight)
      : placement.height;
  return {
    x: west ? x + width - nextWidth : x,
    y: north ? y + height - nextHeight! : y,
    width: nextWidth,
    ...(nextHeight !== undefined ? { height: nextHeight } : {}),
  };
}
export function screenToWorld(
  camera: CanvasCamera,
  point: { x: number; y: number },
) {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}
export function zoomCanvasAt(
  camera: CanvasCamera,
  zoom: number,
  point: { x: number; y: number },
): CanvasCamera {
  const world = screenToWorld(camera, point),
    z = Math.max(0.2, Math.min(2.5, zoom));
  return { zoom: z, x: point.x - world.x * z, y: point.y - world.y * z };
}
export function createCanvasDocument(): CanvasDocument {
  return parseCanvasDocument({
    schema: "nomi-document-ir/draft-1",
    id: "document.home",
    title: "我的画布",
    revision: 1,
    notes: [
      { id: "note.start", title: "从一张画布开始", blocks: ["text.start"] },
      { id: "note.questions", title: "观察与问题", blocks: ["text.questions"] },
    ],
    blocks: [
      {
        id: "text.start",
        type: "markdown",
        source:
          "## 思考不必排成一条线\n\n这里是一篇完整笔记，旁边可以放图片、附件和交互实验。\n\n- 双击空白处，新建一篇笔记\n- 拖动标题栏，重新组织内容\n- 点击编辑，继续写 Markdown 与公式\n\n**把相关的东西放在一起，让理解慢慢生长。**",
      },
      {
        id: "text.questions",
        type: "markdown",
        source:
          "### 调一调右边的温度\n\n温度 $\\tau$ 会改变概率分布：\n\n$$p_i=\\frac{e^{z_i/\\tau}}{\\sum_j e^{z_j/\\tau}}$$\n\n- [ ] 低温时，哪个 token 的概率最高？\n- [ ] 温度变大后，分布如何变化？\n\n在这里写下你的观察。",
      },
      {
        id: "interactive.temperature",
        type: "interactive",
        program: temperatureProgram,
      },
    ],
    assets: [],
    board: {
      id: "board.main",
      placements: [
        { id: "place.start", content: "note.start", x: 0, y: 0, width: 430 },
        {
          id: "place.questions",
          content: "note.questions",
          x: 0,
          y: 410,
          width: 430,
        },
        {
          id: "place.temperature",
          content: "interactive.temperature",
          x: 500,
          y: 0,
          width: 700,
        },
      ],
    },
  });
}
