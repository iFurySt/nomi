## [2026-11-17 22:01] | Task: 修复交互块前后空行无法删除

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6 系列 Codex
- **Runtime**: Codex desktop

### 📥 User Query

> 交互块前后的空行无法删除，希望能正常删除当前行。

### 🛠 Changes Overview

**Scope:** 文稿 Markdown 编辑器和内嵌块边界。

- 首空段 Backspace / 尾空段 Delete 删除当前段落，独立历史事务支持撤销重做。
- 单独空 Markdown 块只解除当前文稿引用；同伴须再次确认仍为空。
- 自动输入占位可收起，显式聚焦继续写入；保留空文稿唯一入口。
- 增加隔离 Electron 回归，检查输入法、持久化、块保留及占位重新输入。

### 🧠 Design Intent (Why)

正文在内嵌块两侧由独立编辑器承载，默认删除命令不能越过编辑区起止位置。显式删除空段本身，避免跨块误删；虚拟占位保持视图状态，不为隐藏入口新增文档数据。

### 📁 Files Modified

- `packages/ui/src/writing/RichMarkdownEditor.tsx`
- `packages/ui/src/pages/Notes.tsx`
- `packages/ui/src/writing/writing.css`
- `scripts/check-empty-boundaries.mjs`
- `docs/design-docs/notes-authoring.md`、`docs/QUALITY_SCORE.md`

### 验证

`pnpm check`、`pnpm build`、空行专项、原 `check-notes-ime.mjs` 与 `check-block-selection.mjs` 通过。验证首尾删除、输入法组合保护、撤销重做、保存重开、连续空块、虚拟占位及再次输入。

- [前侧空行删除后](../../generated/verification/20261117-deleted-boundaries.png)
- [后侧空行删除后](../../generated/verification/20261117-deleted-trailing-boundary.png)

开发版确认已保存后重启，文稿页面可见；正式版和真实文稿内容未修改。未提交、推送或发布。虚拟占位收起不持久化，重新打开仍可出现输入入口。

### 同任务追加：间距与两步删除

用户补充要求交互块上下留白一致，删除下方空行后选中前面的交互块 / 画布 / 图片，再按一次删除移除块。

- 去除紧邻任意内嵌块前的末段额外 margin，沿用外层块间距。
- `useBlockSelection` 提供程序化单块选中入口；空行删除完成后使用既有选区、高亮与键盘复制 / 剪切 / 删除，不另造一份选中状态。
- 重复按键事件不删除刚选中的块；真实块删除继续进入文稿历史。
- 扩充隔离回归覆盖交互块、画布、图片的两步删除与恢复，精确测量交互块前后间距，原框选回归通过。类型 / 构建 / 基础 CI 通过，开发版重启。

新增修改 `packages/ui/src/writing/useBlockSelection.ts`；[图片选中证据](../../generated/verification/20261117-selected-image-boundary.png)。
