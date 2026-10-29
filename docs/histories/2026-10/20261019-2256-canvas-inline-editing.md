## [2026-10-19 22:56] | Task: 双击笔记默认原位编辑

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex Desktop

### 📥 User Query

> 双击默认在当前位置编辑，点击旁边或标题栏完成后渲染，保留放大图标进入弹窗实时编辑与预览。

### 🛠 Changes Overview

**Scope:** Canvas UI、样例说明、真实 Electron 回归和文档。

- 双击正文进入原位编辑并自动聚焦源码，保持摄像机与文档位置；链接和交互控件仍处理自己的双击。
- 标题栏新增显式「完成」文字，点击卡片外部或焦点移出卡片后退出编辑；同一卡片内切换标题、正文和插入控件保持编辑。
- 放大先结束原位编辑分组，再使用同一正文进入已有弹窗源码 / 渲染实时预览；不保留隐藏的第二个原位编辑器。
- 更新新建体验样例说明；不迁移或覆盖已有用户正文。
- 增加双击原位、外部恢复渲染、完成、键盘焦点边界、内部焦点保持、放大正文连续性与几何不变的真实 App 回归。

### 🧠 Design Intent (Why)

写作直接发生在画布空间中，长文或复杂公式可随时放大；两种视图读写同一份内容，完成编辑不额外改变 DSL 语义和保存模型。

### 📁 Files Modified

- `packages/ui/src/pages/Canvas.tsx`
- `packages/ui/src/canvas/canvas.css`
- `packages/ui/src/canvas/examples.ts`
- `scripts/check-canvas.mjs`
- `docs/design-docs/canvas-workspace-runtime.md`
- `docs/design-docs/notes-infinite-canvas.md`
- `docs/DESKTOP.md`、`docs/QUALITY_SCORE.md`
- `docs/releases/feature-release-notes.md`

### 验证

`pnpm check`、`pnpm build`、`make ci`、`git diff --check` 与完整画布 smoke（包含附件、undo / redo、错误与恢复路径）通过。真实运行的 App 已加载新版本，以原生双击确认原位编辑和「完成」显示，再点击旁边确认恢复 Markdown / LaTeX 渲染；没有修改用户正文。合成截图见 `docs/generated/verification/nomi-canvas-inline-editing-2026-10-19.png`。
