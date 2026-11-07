## [2026-11-07 16:45] | Task: 修复公式编辑高亮与首次粘贴

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 打开公式编辑时保持目标公式高亮，表格内公式也要有悬停效果；修复输入框经常无法直接粘贴的问题。

### 🛠 Changes Overview

**Scope:** `packages/ui`、文稿 smoke 回归与设计文档。

- 打开公式改为同步交接焦点，消除延迟正文 focus 抢回输入框焦点的问题。
- 编辑浮层持续标记当前公式，文档位置映射和实时预览替换节点后仍保持高亮，关闭时清理。
- 表格行内公式与块公式共用内容范围内的悬停 / 编辑底色，修复高亮引用未定义颜色变量而透明的问题。
- 扩展 smoke 检查，覆盖打开后跨动画帧的输入框焦点和可见高亮。

### 🧠 Design Intent (Why)

公式预览是编辑目标，源码输入框是输入目标；两者需要同时清晰可见，正文不能异步抢回焦点。

### ✅ Validation

- `pnpm check`、`pnpm build` 通过。
- 公式分隔符和表格输出测试：2 个文件、8 项通过。
- 浏览器合成文稿验证块公式与表格公式的首次粘贴、输入框焦点、持续高亮及实时更新。
- 重启 Nomi(Dev)，在合成测试文稿中实际打开表格公式，直接粘贴和连续替换，确认预览高亮、焦点保留及 Esc 收起；未操作正式版和用户正文。
- 本轮未运行完整文稿 smoke；新增断言已纳入脚本。

### 📁 Files Modified

- `packages/ui/src/writing/FormulaPopover.tsx`
- `packages/ui/src/writing/RichMarkdownEditor.tsx`
- `packages/ui/src/writing/writing.css`
- `scripts/check-notes.mjs`
- `docs/design-docs/notes-authoring.md`
