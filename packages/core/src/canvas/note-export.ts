import { parseCanvasDocument, type CanvasDocument } from "./document";
import { blockAssetIds } from "./embedded-canvas";

export interface NoteExportOptions {
  format: "markdown" | "jekyll";
  slug: string;
  date: string;
  lang: "zh" | "en";
  tags: string[];
}
export function noteFileId(id: string) {
  return Array.from(id, (c) =>
    c.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
}
export function noteAssetFile(asset: CanvasDocument["assets"][number]) {
  const ext =
    asset.mime === "image/png"
      ? "png"
      : asset.mime === "image/jpeg"
        ? "jpg"
        : asset.mime === "image/webp"
          ? "webp"
          : asset.mime === "image/gif"
            ? "gif"
            : asset.mime === "application/pdf"
              ? "pdf"
              : (asset.name.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1] ?? "bin");
  return `${noteFileId(asset.id)}.${ext}`;
}
const label = (text: string) =>
  text.replace(/[\\[\]*_`<>]/g, "\\$&").replace(/[\r\n]/g, " ");

/** Export only the chosen note and its reachable content, never camera or learner state. */
export function planNoteExport(
  input: CanvasDocument,
  noteId: string,
  options: NoteExportOptions,
) {
  const document = parseCanvasDocument(input);
  const note = document.notes.find((n) => n.id === noteId);
  if (!note) throw Error("文稿已不存在。");
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.slug) ||
    options.slug.length > 100
  )
    throw Error("文件名请用小写字母、数字与短横线，最多 100 字符。");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.date) ||
    !Number.isFinite(Date.parse(options.date)) ||
    new Date(options.date).toISOString().slice(0, 10) !== options.date
  )
    throw Error("请选择有效日期。");
  if (
    !["zh", "en"].includes(options.lang) ||
    !["markdown", "jekyll"].includes(options.format)
  )
    throw Error("导出格式无效。");
  const blocks = note.blocks.map((id) =>
    document.blocks.find((b) => b.id === id)!,
  );
  const assets = document.assets.filter(
    (a) =>
      blocks.some((b) => blockAssetIds(b).includes(a.id)) ||
      (note.icon?.type === "image" && note.icon.asset === a.id),
  );
  const { parentId: _parentId, ...standaloneNote } = note;
  const snapshot: CanvasDocument = {
    schema: document.schema,
    id: document.id,
    title: note.title,
    revision: 1,
    notes: [standaloneNote],
    blocks,
    assets,
    board: { id: document.board.id, placements: [] },
  };
  const directory = `assets/nomi/${options.slug}`;
  const assetPath = (file: string) =>
    options.format === "jekyll"
      ? `{{ '/${directory}/${file}' | relative_url }}`
      : `${directory}/${file}`;
  const warnings: string[] = [];
  const body = blocks
    .map((block) => {
      if (block.type === "markdown") return block.source;
      if (block.type === "note-reference") {
        warnings.push(
          "文稿引用仅导出名称，不包含目标正文。请在 Nomi 中打开引用。",
        );
        return `${label(document.notes.find((n) => block.documentId === document.id && n.id === block.noteId)?.title || block.title || "未命名文稿")}（文稿引用）`;
      }
      if (block.type === "canvas") {
        warnings.push("画布绘图请在随包附带的离线阅读页或 Nomi 文稿中查看。");
        return `[画布绘图](${assetPath("index.html")}#${noteFileId(block.id)})`;
      }
      if (block.type === "interactive") {
        const path = assetPath(`${noteFileId(block.id)}.html`);
        return options.format === "jekyll"
          ? `<iframe src="${path}" title="交互实验" loading="lazy" sandbox="allow-scripts" style="width:100%;height:900px;border:0;border-radius:12px;"></iframe>`
          : `[打开交互实验：${label(block.program.id)}](${path})`;
      }
      if (block.type === "image" || block.type === "file") {
        const asset = assets.find((a) => a.id === block.asset)!;
        return `${block.type === "image" ? "!" : ""}[${label(block.type === "image" && block.caption ? block.caption : asset.name)}](${assetPath(noteAssetFile(asset))})${block.type === "image" && block.caption ? `\n\n*${label(block.caption)}*` : ""}`;
      }
      warnings.push(
        "形状导出为文字；完整形状定义保留在随包附带的 Nomi 文稿中。",
      );
      return block.type === "shape" ? block.text : "";
    })
    .join("\n\n");
  const title = note.title || "未命名文稿";
  const frontMatter = [
    "---",
    "layout: post",
    `title: ${JSON.stringify(title)}`,
    `date: ${options.date}T08:00:00+08:00`,
    `lang: ${options.lang}`,
    `tags: ${JSON.stringify(options.tags)}`,
    "toc:",
    "  sidebar: left",
    "---",
    "",
  ].join("\n");
  return {
    markdown:
      options.format === "jekyll"
        ? `${frontMatter}\n${body}\n`
        : `# ${title.replace(/[\r\n]/g, " ")}\n\n${body}\n`,
    path:
      options.format === "jekyll"
        ? `${options.lang === "en" ? "_en_posts" : "_posts"}/${options.date}-${options.slug}.md`
        : `${options.slug}.md`,
    directory,
    snapshot: parseCanvasDocument(snapshot),
    warnings: [...new Set(warnings)],
  };
}
