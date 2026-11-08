import {
  applyCanvasCommands,
  createCanvasDocument,
  newCanvasId,
  type CanvasCommand,
  type CanvasDocument,
} from "./document";

/** Model output is an isolated scene, never a patch against a user's library. */
export function parseCanvasGeneration(text: string): CanvasDocument {
  if (text.length > 32000) throw Error("生成内容过大，请缩小范围。");
  const value = JSON.parse(
    text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1"),
  );
  if (
    !value ||
    Object.keys(value).join() !== "commands" ||
    !Array.isArray(value.commands) ||
    !value.commands.length ||
    value.commands.length > 60
  )
    throw Error("生成结果必须包含 1–60 条新增命令。");
  for (const c of value.commands) {
    if (!c || (c.type !== "add_block" && c.type !== "connect"))
      throw Error("生成结果不能修改已有内容。");
    if (
      c.type === "add_block" &&
      (Object.keys(c).some(
        (k) => !["type", "block", "placement"].includes(k),
      ) ||
        !c.placement ||
        !["shape", "markdown", "interactive"].includes(c.block?.type))
    )
      throw Error("不支持的生成内容类型。");
    if (
      c.type === "connect" &&
      (Object.keys(c).some((k) => !["type", "connector"].includes(k)) ||
        !c.connector?.from?.placement ||
        !c.connector?.to?.placement)
    )
      throw Error("连线必须连接本次生成的对象。");
  }
  const empty = createCanvasDocument();
  empty.id = newCanvasId("preview");
  empty.notes = [];
  empty.blocks = [];
  empty.assets = [];
  empty.board.placements = [];
  empty.board.connectors = [];
  const scene = applyCanvasCommands(empty, empty.revision, value.commands);
  if (
    scene.board.placements.some(
      (p) =>
        Math.abs(p.x) > 4000 ||
        Math.abs(p.y) > 4000 ||
        p.width > 2000 ||
        (p.height ?? 0) > 2000,
    )
  )
    throw Error("生成布局过大，请减少对象数量。");
  return scene;
}

/** Only complete command objects become previews; incomplete JSON is never repaired. */
export function canvasGenerationPrefix(text: string): string | undefined {
  if (text.length > 32000) throw Error("生成内容过大，请缩小范围。");
  const match = text.match(/^\s*(?:```(?:json)?\s*)?\{\s*"commands"\s*:\s*\[/);
  if (!match) return;
  let depth = 0,
    quoted = false,
    escaped = false,
    end = -1;
  for (let i = match[0].length; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      if (depth === 0) break;
      depth--;
      if (depth === 0) end = i + 1;
    }
  }
  return end < 0
    ? undefined
    : '{"commands":[' + text.slice(match[0].length, end) + "]}";
}

export function canvasGenerationCommands(
  scene: CanvasDocument,
  origin: { x: number; y: number },
): CanvasCommand[] {
  const ids = new Map(
    [
      ...scene.blocks,
      ...scene.board.placements,
      ...(scene.board.connectors ?? []),
    ].map((x) => [x.id, newCanvasId("ai")]),
  );
  const left = Math.min(...scene.board.placements.map((p) => p.x));
  const top = Math.min(...scene.board.placements.map((p) => p.y));
  return [
    ...scene.board.placements.map((p) => ({
      type: "add_block" as const,
      block: {
        ...scene.blocks.find((b) => b.id === p.content)!,
        id: ids.get(p.content)!,
      },
      placement: {
        ...p,
        id: ids.get(p.id)!,
        content: ids.get(p.content)!,
        x: p.x - left + origin.x,
        y: p.y - top + origin.y,
      },
    })),
    ...(scene.board.connectors ?? []).map((c) => ({
      type: "connect" as const,
      connector: {
        ...c,
        id: ids.get(c.id)!,
        from: {
          side: c.from.side,
          ...(c.from.anchor ? { anchor: c.from.anchor } : {}),
          placement: ids.get(c.from.placement!)!,
        },
        to: {
          side: c.to.side,
          ...(c.to.anchor ? { anchor: c.to.anchor } : {}),
          placement: ids.get(c.to.placement!)!,
        },
      },
    })),
  ];
}

export const NOTE_INTERACTION_UNSUPPORTED =
  "暂不支持这种交互，请换一种方式描述。";
export const NOTE_INTERACTION_REQUIRED = "未生成可操作的交互块，请重试。";

/** Same safe transport, with a separate note result contract. Never fall back to diagrams. */
export function parseNoteGeneration(
  text: string,
  partial = false,
): CanvasDocument {
  if (
    text.length <= 32000 &&
    /^\s*\{\s*"error"\s*:\s*"unsupported_interaction"\s*\}\s*$/.test(text)
  )
    throw Error(NOTE_INTERACTION_UNSUPPORTED);
  const scene = parseCanvasGeneration(text);
  if (
    scene.board.connectors?.length ||
    scene.blocks.length > 10 ||
    scene.blocks.some((b) => b.type !== "markdown" && b.type !== "interactive")
  )
    throw Error(NOTE_INTERACTION_REQUIRED);
  const interactive = scene.blocks.filter((b) => b.type === "interactive");
  if (
    (!partial && !interactive.length) ||
    interactive.some(
      (b) =>
        !b.program.nodes.some(
          (n) =>
            (n.component === "Slider" || n.component === "SegmentedControl") &&
            n.bind?.value,
        ),
    )
  )
    throw Error(NOTE_INTERACTION_REQUIRED);
  return scene;
}
