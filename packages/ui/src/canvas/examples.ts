import {
  temperatureProgram,
  type CanvasDocument,
  type CanvasCommand,
  type CanvasBlock,
  type CanvasAsset,
  type Placement,
} from "@nomi/core";
import { canvasAssetDigest, type CanvasAssetWrite } from "@nomi/platform";
const prefix = "examples.v1";
export const canvasExampleStops = [
  { id: `${prefix}.place.markdown`, label: "01 · Markdown 长笔记" },
  { id: `${prefix}.place.math`, label: "02 · LaTeX 数学公式" },
  { id: `${prefix}.place.image`, label: "03 · 图片原件" },
  { id: `${prefix}.place.textfile`, label: "04 · 文本文件附件" },
  { id: `${prefix}.place.pdf`, label: "05 · PDF 原件附件" },
  { id: `${prefix}.place.interactive`, label: "06 · 交互学习块" },
  { id: `${prefix}.place.mixed`, label: "07 · 混排长笔记" },
  { id: `${prefix}.place.mirror`, label: "08 · 同一内容的另一处摆放" },
  { id: `${prefix}.place.rectangle`, label: "09 · 矩形与连接" },
  { id: `${prefix}.place.diamond`, label: "10 · 菱形与虚线箭头" },
  { id: `${prefix}.place.ellipse`, label: "11 · 椭圆与形状文字" },
] as const;
/** A reproducible local raster asset; no remote image requests or embedded scripts. */
export function createCanvasExampleImage(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f5f1";
  ctx.fillRect(0, 0, 960, 540);
  ctx.fillStyle = "#222823";
  ctx.font = "500 34px system-ui";
  ctx.fillText("From a thought to understanding", 58, 76);
  ctx.fillStyle = "#788178";
  ctx.font = "18px system-ui";
  ctx.fillText("Nomi · an original image on your canvas", 58, 112);
  const items = [
    { x: 58, y: 200, label: "Capture", sub: "an idea", fill: "#dce9e0" },
    {
      x: 358,
      y: 200,
      label: "Connect",
      sub: "notes + sources",
      fill: "#e3e6ee",
    },
    {
      x: 658,
      y: 200,
      label: "Explore",
      sub: "learn by doing",
      fill: "#ede3d5",
    },
  ];
  for (const item of items) {
    ctx.fillStyle = item.fill;
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, 244, 158, 20);
    ctx.fill();
    ctx.fillStyle = "#29322c";
    ctx.font = "500 28px system-ui";
    ctx.fillText(item.label, item.x + 26, item.y + 62);
    ctx.fillStyle = "#667168";
    ctx.font = "18px system-ui";
    ctx.fillText(item.sub, item.x + 26, item.y + 103);
  }
  ctx.strokeStyle = "#869088";
  ctx.lineWidth = 2;
  for (const x of [314, 614]) {
    ctx.beginPath();
    ctx.moveTo(x, 279);
    ctx.lineTo(x + 30, 279);
    ctx.lineTo(x + 23, 273);
    ctx.moveTo(x + 30, 279);
    ctx.lineTo(x + 23, 285);
    ctx.stroke();
  }
  ctx.fillStyle = "#788178";
  ctx.font = "17px system-ui";
  ctx.fillText(
    "Move it, resize it, reuse it in a note, or download the original.",
    58,
    462,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("样例图片生成失败。"))),
      "image/png",
    ),
  );
}
/** Minimal valid one-page PDF, built from ASCII bytes with exact xref offsets. */
export function createCanvasExamplePdf(): Blob {
  const stream =
    "BT /F1 24 Tf 58 710 Td (Nomi - PDF attachment example) Tj /F1 12 Tf 0 -42 Td (This is a real PDF original stored in your local canvas.) Tj 0 -24 Td (Download it to open in your preferred PDF reader.) Tj 0 -24 Td (Canvas placement and original file bytes are separate.) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(source.length);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = source.length;
  source += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([source], { type: "application/pdf" });
}
export async function buildCanvasExamples(
  document: CanvasDocument,
  image: Blob,
) {
  const commands: CanvasCommand[] = [],
    assets: CanvasAssetWrite[] = [];
  const allIds = new Set([
    document.id,
    document.board.id,
    ...document.notes.map((n) => n.id),
    ...document.blocks.map((b) => b.id),
    ...document.assets.map((a) => a.id),
    ...document.board.placements.map((p) => p.id),
    ...(document.board.connectors ?? []).map((c) => c.id),
  ]);
  const right = Math.max(
    0,
    ...document.board.placements
      .filter((p) => !p.id.startsWith(prefix))
      .map((p) => p.x + p.width),
  );
  const origin = right + 180;
  const place = (
    key: string,
    content: string,
    x: number,
    y: number,
    width: number,
  ): Placement => ({
    id: `${prefix}.place.${key}`,
    content,
    x: origin + x,
    y,
    width,
  });
  const addPlacement = (p: Placement) => {
    if (document.board.placements.some((old) => old.id === p.id)) return;
    if (allIds.has(p.id)) throw Error("样例摆放 ID 已被其他对象占用。");
    commands.push({ type: "place", placement: p });
    allIds.add(p.id);
  };
  const note = (
    key: string,
    title: string,
    source: string,
    p: Placement,
    extra: string[] = [],
  ) => {
    const id = `${prefix}.note.${key}`,
      blockId = `${prefix}.text.${key}`;
    if (document.notes.some((n) => n.id === id)) {
      addPlacement(p);
      return;
    }
    if (allIds.has(id) || allIds.has(blockId))
      throw Error("样例内容 ID 已被其他对象占用。");
    commands.push({
      type: "create_note",
      note: { id, title, blocks: [blockId, ...extra] },
      block: { id: blockId, type: "markdown", source },
      placement: p,
    });
    allIds.add(id);
    allIds.add(blockId);
    allIds.add(p.id);
  };
  const assetBlock = async (
    key: string,
    name: string,
    mime: string,
    blob: Blob,
    p: Placement,
    type: "image" | "file",
  ) => {
    const id = `${prefix}.block.${key}`,
      assetId = `${prefix}.asset.${key}`;
    if (document.blocks.some((b) => b.id === id)) {
      addPlacement(p);
      return;
    }
    if (allIds.has(id) || allIds.has(assetId))
      throw Error("样例附件 ID 已被其他对象占用。");
    const asset: CanvasAsset = {
      id: assetId,
      name,
      mime,
      bytes: blob.size,
      sha256: await canvasAssetDigest(blob),
      ...(type === "image" ? { width: 960, height: 540 } : {}),
    };
    const block: CanvasBlock = { id, type, asset: assetId };
    commands.push({ type: "add_block", block, asset, placement: p });
    assets.push({ asset, blob });
    allIds.add(id);
    allIds.add(assetId);
    allIds.add(p.id);
  };
  note(
    "markdown",
    "01 · Markdown 长笔记",
    [
      "# 从一个问题开始",
      "这是一篇真正可编辑的长笔记。双击正文原位编辑；点击外部或「完成」恢复渲染，点放大图标进入聚焦编辑与预览。",
      "## 基础排版",
      "**重点**、*强调*、`行内代码`，以及普通段落。",
      "- 一个想法\n- 一条证据\n- 下一步行动",
      "> 把原始记录、自己的判断和来源分清楚。",
      "## 表格",
      "| 内容 | 用途 |\n| --- | --- |\n| 笔记 | 记录与推理 |\n| 图片 / 文件 | 保存原始来源 |\n| 交互块 | 改变参数，观察规律 |",
      "## 代码",
      "```ts\nconst learn = (question: string) => ({\n  question,\n  next: 'try it on the canvas',\n});\n```",
      "## 待办",
      "- [ ] 写下一个问题\n- [ ] 添加参考资料\n- [ ] 试着修改这篇笔记",
      "## 长文体验",
      ...Array.from(
        { length: 8 },
        (_, i) =>
          `### ${i + 1}. 继续积累\n\n画布保留内容之间的空间关系，聚焦视图适合持续阅读和写作。试着修改这一段，再去第 08 个样例查看：两个摆放引用的是同一份正文。`,
      ),
    ].join("\n\n"),
    place("markdown", `${prefix}.note.markdown`, 0, 0, 480),
  );
  note(
    "math",
    "02 · LaTeX 数学公式",
    String.raw`## 公式也是笔记的一部分

行内公式：$E=mc^2$，以及 $\tau>0$。

### 概率分布

$$
p_i=\frac{e^{z_i/\tau}}{\sum_j e^{z_j/\tau}}
$$

### 矩阵与对齐推导

$$
A=\begin{bmatrix}1&2\\3&4\end{bmatrix}
$$

$$
\begin{aligned}
f(x)&=x^2\\
f'(x)&=2x\\
\int_0^1 f(x)\,dx&=\frac13
\end{aligned}
$$

进入编辑，直接修改 LaTeX 源码。`,
    place("math", `${prefix}.note.math`, 550, 0, 480),
  );
  await assetBlock(
    "image",
    "03 · 图片样例.png",
    "image/png",
    image,
    place("image", `${prefix}.block.image`, 1100, 0, 480),
    "image",
  );
  await assetBlock(
    "textfile",
    "04 · 文件样例.txt",
    "text/plain",
    new Blob(
      [
        "Nomi 文件附件体验\n\n这是保存在本机的原始文本文件。\n点击附件可以下载原件，移动画布卡片不会改变文件内容。\n同一个文件也可以出现在混排笔记里。\n",
      ],
      { type: "text/plain" },
    ),
    place("textfile", `${prefix}.block.textfile`, 1100, 400, 480),
    "file",
  );
  await assetBlock(
    "pdf",
    "05 · PDF 样例.pdf",
    "application/pdf",
    createCanvasExamplePdf(),
    place("pdf", `${prefix}.block.pdf`, 1100, 600, 480),
    "file",
  );
  const interactiveId = `${prefix}.block.interactive`,
    interactivePlace = place("interactive", interactiveId, 0, 760, 700);
  if (document.blocks.some((b) => b.id === interactiveId))
    addPlacement(interactivePlace);
  else {
    if (allIds.has(interactiveId))
      throw Error("样例交互 ID 已被其他对象占用。");
    commands.push({
      type: "add_block",
      block: {
        id: interactiveId,
        type: "interactive",
        program: temperatureProgram,
      },
      placement: interactivePlace,
    });
    allIds.add(interactiveId);
  }
  note(
    "mixed",
    "07 · 文字、图片、附件与交互混排",
    "# 一篇完整的学习笔记\n\n这里把 **Markdown、图片、文件和交互块** 放在同一篇笔记中。\n\n向下滚动查看全部内容，双击正文原位编辑，点击标题栏放大图标进入聚焦视图。下面的图片、附件和交互块，与独立卡片引用的是同一份内容。\n\n试试在第 06 项改变温度，再回到这篇笔记查看参数。",
    place("mixed", `${prefix}.note.mixed`, 780, 850, 800),
    [`${prefix}.block.image`, `${prefix}.block.textfile`, interactiveId],
  );
  addPlacement(place("mirror", `${prefix}.note.markdown`, 1370, 1530, 480));
  for (const [index, shape] of (
    ["rectangle", "diamond", "ellipse"] as const
  ).entries()) {
    const id = `${prefix}.block.${shape}`,
      p = { ...place(shape, id, index * 530, 2250, 360), height: 210 };
    if (document.blocks.some((b) => b.id === id)) addPlacement(p);
    else {
      if (allIds.has(id)) throw Error("样例形状 ID 已被占用。");
      commands.push({
        type: "add_block",
        block: {
          id,
          type: "shape",
          shape,
          text: ["收集问题", "建立联系", "验证与理解"][index],
          tone: (["sage", "sand", "blue"] as const)[index],
        },
        placement: p,
      });
      allIds.add(id);
      allIds.add(p.id);
    }
  }
  for (const [index, from, to] of [
    [0, "rectangle", "diamond"],
    [1, "diamond", "ellipse"],
  ] as const) {
    const id = `${prefix}.connection.${index}`;
    if (document.board.connectors?.some((c) => c.id === id)) continue;
    if (allIds.has(id)) throw Error("样例连接 ID 已被占用。");
    commands.push({
      type: "connect",
      connector: {
        id,
        from: { placement: `${prefix}.place.${from}`, side: "e" },
        to: { placement: `${prefix}.place.${to}`, side: "w" },
        routing: index === 0 ? "elbow" : "curve",
        style: index === 0 ? "solid" : "dashed",
        startArrow: false,
        endArrow: true,
        label: index === 0 ? "组织想法" : "交互验证",
      },
    });
    allIds.add(id);
  }
  return { commands, assets };
}
