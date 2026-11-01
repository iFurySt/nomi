// Synthetic data only; launched in a disposable Electron userData directory.
import { createCanvasRepository, canvasAssetDigest } from "@nomi/platform";
import {
  createCanvasDocument,
  temperatureProgram,
  type CanvasBlock,
} from "@nomi/core";
import { createCanvasExampleImage } from "../../packages/ui/src/canvas/examples";
const repo = createCanvasRepository("local-device");
if (!(await repo.load())) {
  const doc = createCanvasDocument();
  doc.blocks = [];
  doc.notes = [];
  doc.assets = [];
  doc.board.placements = [];
  doc.board.connectors = [];
  const prose =
    "超长文稿性能样本：记录一个问题，收集原始证据，再通过改变参数验证自己的理解。文字、数学、代码和附件应当共同保持可编辑，不因篇幅增长而丢失内容。".repeat(
      3,
    );
  const section = (i: number) =>
    `## 第 ${i + 1} 节 · 观察与推理\n\n${prose}\n\n${prose}\n\n` +
    (i % 8 === 0
      ? "| 条件 | 观察 |\n| --- | --- |\n| A | 保留原始数据 |\n| B | 比较变化 |\n\n$$\nf(x)=x^2+2x+1\n$$\n\n```javascript\nconst result = [1, 2, 3].map(x => x * x);\n```\n\n"
      : "");
  doc.blocks.push({
    id: "perf.long.text",
    type: "markdown",
    source: Array.from({ length: 420 }, (_, i) => section(i)).join("\n"),
  });
  doc.notes.push({
    id: "perf.long",
    title: "性能样本 · 超长单篇",
    blocks: ["perf.long.text"],
  });
  const blob = await createCanvasExampleImage();
  const asset = {
    id: "perf.image",
    name: "合成示意图.png",
    mime: "image/png",
    bytes: blob.size,
    sha256: await canvasAssetDigest(blob),
    width: 960,
    height: 540,
  };
  const fileBlob = new Blob(["Synthetic local attachment."], {
    type: "text/plain",
  });
  const fileAsset = {
    id: "perf.file",
    name: "合成附件.txt",
    mime: "text/plain",
    bytes: fileBlob.size,
    sha256: await canvasAssetDigest(fileBlob),
  };
  doc.assets.push(asset, fileAsset);
  const mixed: CanvasBlock[] = [];
  for (let i = 0; i < 60; i++) {
    mixed.push({
      id: `perf.text.${i}`,
      type: "markdown",
      source: Array.from({ length: 4 }, (_, j) => section(i * 4 + j)).join(
        "\n",
      ),
    });
    if (i % 10 === 0)
      mixed.push({
        id: `perf.lab.${i}`,
        type: "interactive",
        program: temperatureProgram,
      });
    else if (i % 3 === 0)
      mixed.push({
        id: `perf.image.${i}`,
        type: "image",
        asset: asset.id,
        caption: `图片 ${i}`,
      });
    else
      mixed.push({ id: `perf.file.${i}`, type: "file", asset: fileAsset.id });
  }
  doc.blocks.push(...mixed);
  doc.notes.push({
    id: "perf.mixed",
    title: "性能样本 · 长篇混排",
    blocks: mixed.map((b) => b.id),
  });
  await repo.save(
    doc,
    [
      { asset, blob },
      { asset: fileAsset, blob: fileBlob },
    ],
    null,
  );
}
await import("./canvas");
