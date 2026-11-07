## [2026-11-07 16:25] | Task: 兼容粘贴表格与公式分隔符

### Execution Context

- Agent: `/root`
- Runtime: Codex desktop

### User Query

粘贴表格时自动识别公式，公式编辑框支持 `\(V\)` 等带外层分隔符的输入。

### Changes

- 统一公式分隔符识别：公式编辑器提取完整外层分隔符，实时预览与保存使用公式体。
- 富文本表格 / 正文粘贴递归识别有效的明确标记公式，保留表格结构和文字样式；代码和强制纯文本粘贴不转换。
- Markdown 读取、粘贴及只读渲染兼容反斜杠数学分隔符；保留代码示例和已有美元公式。表格内显示公式降为行内公式，避免拆坏单元格。
- 更新文稿设计契约及分隔符、代码保护、表格结构回归。

### Files

- `packages/ui/src/writing/mathDelimiters.ts`
- `packages/ui/src/writing/mathDelimiters.test.ts`
- `packages/ui/src/writing/clipboard.ts`
- `packages/ui/src/writing/FormulaPopover.tsx`
- `packages/ui/src/writing/RichMarkdownEditor.tsx`
- `packages/ui/src/canvas/Markdown.tsx`
- `packages/ui/src/writing/article-runtime.tsx`
- `docs/design-docs/notes-authoring.md`

### Validation

类型检查、生产构建和公式 / 表格输出 8 项单测通过。浏览器隔离 fixture 验证 HTML 表格三种公式渲染；重启 Nomi(Dev)，实际粘贴 `\(V\)` 验证实时预览，再粘贴含下标公式的表格，切换文稿后重开确认保存。已检查实际窗口截图；未操作正式版或真实写作文稿，未运行全量 Notes smoke。
