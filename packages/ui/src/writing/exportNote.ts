import { zipSync, strToU8 } from "fflate";
import {
  planNoteExport,
  noteFileId,
  noteAssetFile,
  type CanvasDocument,
  type NoteExportOptions,
} from "@nomi/core";
import { canvasAssetDigest, type CanvasRepository } from "@nomi/platform";
import runtime from "virtual:nomi-note-runtime";
const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function reader(document: CanvasDocument, block?: string) {
  const json = JSON.stringify({ document, block })
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src data:; connect-src 'none'; base-uri 'none'"><title>${escapeHTML(document.title)}</title><link rel="stylesheet" href="runtime.css"><body><div id="root"></div><script type="application/json" id="nomi-article">${json}</script><script src="runtime.js"></script></body></html>`;
}
export async function createNoteArchive(
  document: CanvasDocument,
  noteId: string,
  options: NoteExportOptions,
  repository: CanvasRepository,
) {
  const plan = planNoteExport(document, noteId, options);
  const files: Record<string, Uint8Array> = {
    [plan.path]: strToU8(plan.markdown),
    [`${options.slug}.nomi.json`]: strToU8(
      JSON.stringify(plan.snapshot, null, 2),
    ),
  };
  files[`${plan.directory}/index.html`] = strToU8(reader(plan.snapshot));
  files[`${plan.directory}/runtime.js`] = strToU8(runtime.js);
  files[`${plan.directory}/runtime.css`] = strToU8(runtime.css);
  for (const block of plan.snapshot.blocks)
    if (block.type === "interactive")
      files[`${plan.directory}/${noteFileId(block.id)}.html`] = strToU8(
        reader(plan.snapshot, block.id),
      );
  for (const asset of plan.snapshot.assets) {
    const blob = await repository.asset(asset.id);
    if (
      !blob ||
      blob.size !== asset.bytes ||
      (await canvasAssetDigest(blob)) !== asset.sha256
    )
      throw Error(
        `附件「${asset.name}」缺失或校验失败，未生成不完整的导出包。`,
      );
    files[`${plan.directory}/${noteAssetFile(asset)}`] = new Uint8Array(
      await blob.arrayBuffer(),
    );
  }
  files["README.txt"] = strToU8(
    `Nomi 文稿：${plan.snapshot.title}\n\n正文：${plan.path}\n离线阅读与交互：${plan.directory}/index.html\nNomi 原始定义：${options.slug}.nomi.json\n\n${options.format === "jekyll" ? "将 _posts（或 _en_posts）和 assets 目录复制到博客仓库再预览。交互块通过 iframe 加载随包附带的运行时。" : "Markdown 中的交互链接打开随包附带的 HTML；只复制 Markdown 会丢失附件和交互。"}\n未包含个人学习进度。此包是发布快照，后续修改请重新导出。\n${plan.warnings.join("\n")}`,
  );
  return { bytes: zipSync(files, { level: 6 }), warnings: plan.warnings };
}
export function downloadFile(
  bytes: Uint8Array,
  name: string,
  mime = "application/zip",
) {
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
