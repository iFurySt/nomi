## [2026-11-07 17:10] | Task: 公式源码复制与表格直接操作

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 公式工具栏增加复制，选中公式复制时输出 LaTeX 语法；参考飞书完善表格列宽调整和行列插入。

### 🛠 Changes Overview

**Scope:** `packages/ui` 文稿编辑器。

- 公式工具栏增加复制图标和成功反馈，选中公式 Cmd/Ctrl+C 输出带分隔符的纯文本；混合选区、表格 TSV / CSV 保留公式源码。
- 表格边缘悬停显示行列操作柄与添加按钮，支持上下插行、左右插列、删除、整行 / 整列选择、均分列宽和右键操作。
- 开启列边界拖动，使用紧邻 GFM 表格的受限宽度注释保存列宽；旧表格不额外增加元数据，撤销与重开均保留表格语义。
- 修复表格控件卸载后访问 editor.view 导致的异常。
- 更新文稿设计文档，明确普通 Markdown / Canvas 阅读暂使用自身表格布局。

### 🧠 Design Intent (Why)

复制的是可分享的公式源，而非视觉字符；表格结构操作靠近当前行列，不让用户寻找远处的块菜单。布局信息可读且独立于内容，继续兼容普通 GFM。

### 📁 Files Modified

- `packages/ui/src/writing/FormulaToolbar.tsx`
- `packages/ui/src/writing/mathClipboard.ts` / `mathClipboard.test.ts`
- `packages/ui/src/writing/TableControls.tsx`
- `packages/ui/src/writing/WritingTable.ts` / `WritingTable.test.ts`
- `packages/ui/src/writing/RichMarkdownEditor.tsx`
- `packages/ui/src/writing/tableOutput.ts` / `tableOutput.test.ts`
- `packages/ui/src/writing/writing.css`
- `docs/design-docs/notes-authoring.md`

### Validation

- 3 个相关测试文件、10 项测试通过；`pnpm check` 和 `pnpm build` 通过。
- 浏览器隔离样例验证行列插入、撤销、列宽调整和重载恢复。
- 只重启 Nomi(Dev)，使用合成文稿实际验证右键插列 / 撤销、拖动列宽 / 重启保留。
- 原生复制图标后粘贴得到 `\(V\)`；选中公式 Cmd+C 后粘贴得到 `\(H_{kv}\)`。
- 未编辑正式版或用户 Transformer 文稿。
