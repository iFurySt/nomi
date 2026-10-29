## [2026-10-19 23:30] | Task: 可选标题与八方向调整尺寸

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex Desktop

### 📥 User Query

> 标题应在标题原位置编辑，普通文本默认无标题；所有画布框的四边、四角都能拖动调整大小。

### 🛠 Changes Overview

**Scope:** 画布领域契约、共享 UI、Electron 验证与文档。

- 新建文本使用空标题；已有标题保留，顶部直接修改 / 清空，不重复插入正文编辑器。聚焦弹窗也只在顶部编辑同一标题。
- Placement 新增可选 height，旧文档不要求迁移并继续自动高度。纯水平调整保留自动高度，首次垂直拖动从实际高度开始。
- 四边四角均可调整尺寸，世界坐标转换与最小 / 最大尺寸统一；上 / 左侧固定对侧，移动和尺寸在同一事务提交。Escape 与 pointer cancel 放弃预览。
- 固定高度容器内长内容滚动，图片保持比例；多个摆放独立保存宽高，不改变正文、附件或共享学习状态。小尺寸框收紧控件防止溢出。
- 新增 11 个领域测试及原生八方向拖动、取消、undo / redo、标题空值与位置、跨内容类型和高度刷新恢复验证。
- 更新设计、运行说明、质量证据、发布说明与执行计划；截图仅使用隔离合成数据。

### 🧠 Design Intent (Why)

标题是可选的组织信息，正文不需要额外的强制标题。框尺寸属于摆放，不是内容：调整空间展示应保留原件和共享引用，旧文档可直接打开，撤销一次恢复整个调整。

### 📁 Files Modified

- `packages/core/src/canvas/document.ts`、`document.test.ts`
- `packages/ui/src/pages/Canvas.tsx`
- `packages/ui/src/canvas/CanvasContent.tsx`、`canvas.css`
- `packages/ui/src/components/primitives.tsx`
- `scripts/check-canvas.mjs`
- `docs/design-docs/canvas-workspace-runtime.md`、`notes-infinite-canvas.md`、`notes-canvas-dsl.md`
- `docs/DESKTOP.md`、`docs/QUALITY_SCORE.md`、`docs/releases/feature-release-notes.md`
- `docs/exec-plans/completed/20261019-canvas-titles-and-resize.md`
- `docs/generated/verification/nomi-canvas-optional-title-resize-2026-10-19.png`

### 验证

`pnpm check`、`pnpm test`（48 文件 / 268 个测试）、`pnpm build`、`pnpm smoke:canvas`、`make ci` 与 `git diff --check` 通过。真实 App 已加载新版本，确认顶部标题直接可编辑、八方向点显示与右下角实际缩放；检查后撤销该次缩放，恢复原有尺寸与正文。
