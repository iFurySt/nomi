import {
  canvasConnectorGeometry,
  canvasEndpointPoint,
  type CanvasConnector,
  type CanvasRect,
} from "@nomi/core";
export function detachedConnector(
  c: CanvasConnector,
  rectangles: CanvasRect[],
  offset = 0,
): CanvasConnector {
  const from = canvasEndpointPoint(c.from, rectangles),
    to = canvasEndpointPoint(c.to, rectangles);
  if (!from || !to) throw Error("连接端点已不存在");
  const shift = (p: { x: number; y: number }) => ({
    x: p.x + offset,
    y: p.y + offset,
  });
  return {
    ...structuredClone(c),
    from: { point: shift(from), side: c.from.side },
    to: { point: shift(to), side: c.to.side },
    waypoints: c.waypoints?.map(shift) ?? [],
    locked: false,
  };
}
export async function connectorPng(
  c: CanvasConnector,
  rectangles: CanvasRect[],
): Promise<Blob> {
  const geometry = canvasConnectorGeometry(c, rectangles);
  const source = document.querySelector(`[data-connector="${c.id}"]`);
  if (!geometry || !source) throw Error("连接已不存在");
  const xs = geometry.points.map((p) => p.x),
    ys = geometry.points.map((p) => p.y),
    left = Math.min(...xs) - 64,
    top = Math.min(...ys) - 64,
    width = Math.max(...xs) - left + 64,
    height = Math.max(...ys) - top + 64;
  if (width > 4096 || height > 4096)
    throw Error("连线图片超过 4096 像素，请缩短连线后再复制");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", `${left} ${top} ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  const defs = source.ownerDocument.querySelector(
    ".canvas-connection-layer defs",
  );
  if (defs) svg.append(defs.cloneNode(true));
  const clone = source.cloneNode(true) as SVGGElement;
  const originals = [source, ...source.querySelectorAll("*")],
    clones = [clone, ...clone.querySelectorAll("*")];
  originals.forEach((el, i) => {
    const style = getComputedStyle(el);
    for (const key of [
      "fill",
      "stroke",
      "stroke-width",
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
    ])
      (clones[i] as SVGElement).style.setProperty(
        key,
        style.getPropertyValue(key),
      );
  });
  clone.querySelector(".canvas-connection-hit")?.remove();
  svg.append(clone);
  const surface =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--surface")
      .trim() || "#ffffff";
  const xml = new XMLSerializer()
    .serializeToString(svg)
    .replaceAll("var(--surface)", surface)
    .replaceAll("var(--surface-muted)", surface);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("无法复制连线图片"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
