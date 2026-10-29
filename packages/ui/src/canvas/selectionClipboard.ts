import {
  parseCanvasDocument,
  newCanvasId,
  canvasSelectionBounds,
  canvasConnectorGeometry,
  type CanvasDocument,
  type CanvasRect,
  type CanvasCommand,
} from "@nomi/core";
export function selectionSnapshot(doc: CanvasDocument, ids: string[]) {
  const placements = doc.board.placements.filter((p) => ids.includes(p.id)),
    selectedNotes = doc.notes.filter((n) =>
      placements.some((p) => p.content === n.id),
    ),
    notes = selectedNotes.map((note) => {
      const { parentId, ...copy } = note;
      return parentId && selectedNotes.some((parent) => parent.id === parentId)
        ? { ...copy, parentId }
        : copy;
    });
  const blocks = doc.blocks.filter(
    (b) =>
      placements.some((p) => p.content === b.id) ||
      notes.some((n) => n.blocks.includes(b.id)),
  );
  return parseCanvasDocument({
    schema: doc.schema,
    id: "clipboard.selection",
    title: "画布选区",
    revision: 1,
    notes,
    blocks,
    assets: doc.assets.filter((a) =>
      blocks.some((b) => "asset" in b && b.asset === a.id),
    ),
    board: {
      id: "clipboard.board",
      placements,
      connectors: (doc.board.connectors ?? []).filter(
        (c) =>
          c.from.placement &&
          ids.includes(c.from.placement) &&
          c.to.placement &&
          ids.includes(c.to.placement),
      ),
    },
  });
}
export function selectionCopyText(snapshot: CanvasDocument) {
  return JSON.stringify({ schema: "nomi-selection/v1", document: snapshot });
}
export function parseSelectionCopy(text: string) {
  if (text.length > 2 * 1024 * 1024) throw Error("选区超过大小限制。");
  const raw = JSON.parse(text);
  if (
    raw.schema !== "nomi-selection/v1" ||
    Object.keys(raw).some((k) => !["schema", "document"].includes(k))
  )
    throw Error("剪贴板不是 Nomi 选区。");
  return parseCanvasDocument(raw.document);
}
export function pasteSelection(
  doc: CanvasDocument,
  snapshot: CanvasDocument,
  offset = { x: 24, y: 24 },
) {
  const commands: CanvasCommand[] = [],
    map = new Map<string, string>(),
    groups = new Map<string, string>();
  const mapped = (id: string, kind = "copy") => {
    if (!map.has(id)) map.set(id, newCanvasId(kind));
    return map.get(id)!;
  };
  for (const a of snapshot.assets)
    if (
      !doc.assets.some(
        (existing) => existing.id === a.id && existing.sha256 === a.sha256,
      )
    )
      throw Error("此选区的附件原件不在当前文档，请先导入原件。");
  for (const b of snapshot.blocks)
    commands.push({
      type: "add_block",
      block: { ...structuredClone(b), id: mapped(b.id, "block") },
    });
  for (const n of snapshot.notes)
    commands.push({
      type: "add_note",
      note: {
        ...n,
        id: mapped(n.id, "note"),
        ...(n.parentId ? { parentId: mapped(n.parentId, "note") } : {}),
        blocks: n.blocks.map((id) => mapped(id, "block")),
      },
    });
  const ids = snapshot.board.placements.map((p) => mapped(p.id, "place"));
  for (const p of snapshot.board.placements) {
    if (p.group && !groups.has(p.group))
      groups.set(p.group, newCanvasId("group"));
    commands.push({
      type: "place",
      placement: {
        ...p,
        id: mapped(p.id, "place"),
        content: mapped(p.content),
        x: p.x + offset.x,
        y: p.y + offset.y,
        locked: false,
        ...(p.group ? { group: groups.get(p.group) } : {}),
      },
    });
  }
  for (const c of snapshot.board.connectors ?? [])
    commands.push({
      type: "connect",
      connector: {
        ...c,
        id: newCanvasId("connection"),
        from: {
          placement: mapped(c.from.placement!),
          side: c.from.side,
          ...(c.from.anchor ? { anchor: { ...c.from.anchor } } : {}),
        },
        to: {
          placement: mapped(c.to.placement!),
          side: c.to.side,
          ...(c.to.anchor ? { anchor: { ...c.to.anchor } } : {}),
        },
        locked: false,
        ...(c.waypoints
          ? {
              waypoints: c.waypoints.map((p) => ({
                x: p.x + offset.x,
                y: p.y + offset.y,
              })),
            }
          : {}),
      },
    });
  return { commands, ids };
}
const xml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function selectionPng(doc: CanvasDocument, rects: CanvasRect[]) {
  const selected = new Set(rects.map((r) => r.id)),
    internal = (doc.board.connectors ?? []).filter(
      (c) =>
        selected.has(c.from.placement ?? "") &&
        selected.has(c.to.placement ?? ""),
    );
  const bounds = canvasSelectionBounds(rects),
    padding = 12;
  for (const c of internal) {
    const geometry = canvasConnectorGeometry(c, rects);
    if (!geometry) continue;
    const right = Math.max(
        bounds.x + bounds.width,
        ...geometry.points.map((p) => p.x + 32),
      ),
      bottom = Math.max(
        bounds.y + bounds.height,
        ...geometry.points.map((p) => p.y + 32),
      );
    bounds.x = Math.min(bounds.x, ...geometry.points.map((p) => p.x - 32));
    bounds.y = Math.min(bounds.y, ...geometry.points.map((p) => p.y - 32));
    bounds.width = right - bounds.x;
    bounds.height = bottom - bounds.y;
  }
  const serializeStyled = (source: Element) => {
    const clone = source.cloneNode(true) as SVGElement,
      original = [source, ...source.querySelectorAll("*")],
      copies = [clone, ...clone.querySelectorAll("*")];
    original.forEach((el, i) => {
      const style = getComputedStyle(el);
      for (const key of [
        "fill",
        "fill-opacity",
        "stroke",
        "stroke-width",
        "stroke-opacity",
        "stroke-dasharray",
        "stroke-linecap",
        "stroke-linejoin",
        "font-size",
        "font-family",
        "font-weight",
        "font-style",
        "paint-order",
        "text-decoration",
        "opacity",
        "vector-effect",
      ])
        (copies[i] as SVGElement).style.setProperty(
          key,
          style.getPropertyValue(key),
        );
    });
    clone.querySelector(".canvas-connection-hit")?.remove();
    return clone;
  };
  const defs = document.querySelector(".canvas-connection-layer defs"),
    surface =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--surface")
        .trim() || "#ffffff";
  const lineParts = (above: boolean) =>
    internal
      .filter((c) => !!c.aboveShapes === above)
      .map((c) => {
        const source = document.querySelector(`[data-connector="${c.id}"]`);
        return source
          ? new XMLSerializer().serializeToString(serializeStyled(source))
          : "";
      })
      .join("");
  const shapes = rects.map((r) => {
    const b = doc.blocks.find((b) => b.id === r.content);
    if (b?.type !== "shape") throw Error("复制为图片目前支持形状选区。");
    return { r, b };
  });
  const parts = shapes.map(({ r, b }) => {
    const source = document.querySelector(
      `[data-placement="${r.id}"] .canvas-shape-content svg`,
    )!;
    const clone = source.cloneNode(true) as SVGElement;
    const original = [source, ...source.querySelectorAll("*")],
      copies = [clone, ...clone.querySelectorAll("*")];
    original.forEach((e, i) => {
      const style = getComputedStyle(e);
      for (const p of [
        "fill",
        "fill-opacity",
        "stroke",
        "stroke-width",
        "stroke-opacity",
        "stroke-dasharray",
        "vector-effect",
      ])
        copies[i].setAttribute(p, style.getPropertyValue(p));
    });
    clone.setAttribute("x", String(r.x - bounds.x + padding));
    clone.setAttribute("y", String(r.y - bounds.y + padding));
    clone.setAttribute("width", String(r.width));
    clone.setAttribute("height", String(r.height));
    clone.removeAttribute("style");
    const t = b.shapeStyle?.text ?? {},
      size = t.size ?? 14,
      span = document.querySelector<HTMLElement>(
        `[data-placement="${r.id}"] .canvas-shape-content > span`,
      ),
      left = r.x - bounds.x + padding + (span?.offsetLeft ?? r.width * 0.15),
      top =
        r.y -
        bounds.y +
        padding +
        (span?.offsetTop ?? r.height / 2 - size * 0.8),
      width = span?.clientWidth ?? r.width * 0.7,
      height = span?.clientHeight ?? r.height * 0.7;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${t.italic ? "italic " : ""}${t.bold ? "700" : "400"} ${size}px system-ui`;
    const rows: string[] = [];
    for (const [i, line] of b.text.split("\n").entries()) {
      const prefix =
        t.list === "bullet"
          ? "• "
          : t.list === "number"
            ? `${i + 1}. `
            : t.list === "quote"
              ? "❝ "
              : "";
      let row = "";
      for (const char of prefix + line) {
        if (
          row &&
          ctx.measureText(row + char).width > Math.max(1, width - 24)
        ) {
          rows.push(row);
          row = "";
        }
        row += char;
      }
      rows.push(row);
    }
    const anchor =
        t.align === "left" ? "start" : t.align === "right" ? "end" : "middle",
      x =
        left +
        (t.align === "left"
          ? 12
          : t.align === "right"
            ? width - 12
            : width / 2),
      clipId = `text-${r.id.replace(/[^a-zA-Z0-9]/g, "")}`;
    const text = rows
      .map(
        (line, i) =>
          `<text x="${x}" y="${top + 12 + size * 0.8 + i * size * 1.6}" text-anchor="${anchor}" font-family="system-ui" font-size="${size}" font-weight="${t.bold ? 700 : 400}" font-style="${t.italic ? "italic" : "normal"}" text-decoration="${[t.underline ? "underline" : "", t.strike ? "line-through" : ""].join(" ")}" fill="${span ? getComputedStyle(span).color : (t.color ?? "#222222")}">${xml(line)}</text>`,
      )
      .join("");
    return (
      new XMLSerializer().serializeToString(clone) +
      `<defs><clipPath id="${clipId}"><rect x="${left}" y="${top}" width="${width}" height="${height}"/></clipPath></defs><g ${t.rotate ? `transform="rotate(90 ${left + width / 2} ${top + height / 2})"` : ""} clip-path="url(#${clipId})">${text}</g>`
    );
  });
  const w = bounds.width + padding * 2,
    h = bounds.height + padding * 2,
    scale = Math.min(2, 4096 / Math.max(w, h));
  const url = URL.createObjectURL(
    new Blob(
      [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs ? new XMLSerializer().serializeToString(defs).replaceAll("var(--surface)", surface).replaceAll("var(--surface-muted)", surface) : ""}<g transform="translate(${padding - bounds.x} ${padding - bounds.y})">${lineParts(false)}</g>${parts.join("")}<g transform="translate(${padding - bounds.x} ${padding - bounds.y})">${lineParts(true)}</g></svg>`,
      ],
      { type: "image/svg+xml" },
    ),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("图片生成失败。"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
