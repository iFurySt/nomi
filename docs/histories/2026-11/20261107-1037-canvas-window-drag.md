## [2026-11-07 10:37] | Task: 恢复内嵌画布顶部窗口拖动

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 画布顶部留白需要能拖动 App 窗口。

### 🛠 Changes Overview

**Scope:** `packages/ui`、内嵌画布验收脚本与架构文档。

- 在 macOS 桌面内嵌画布顶部添加 44px 透明原生窗口拖动区，加载态同样有效。
- 拖动区位于 Close、名称与历史按钮上方，避免阻挡操作控件；其他运行环境不增加该区域。
- 增加样式、覆盖范围及控件不重叠断言。

### 🧠 Design Intent (Why)

全窗口画布覆盖了工作台标题栏，需要显式恢复原生窗口拖动区域，同时保留画布的完整视觉背景。

### 📁 Files Modified

- `packages/ui/src/canvas/EmbeddedCanvasBlock.tsx`
- `packages/ui/src/canvas/embedded-canvas.css`
- `scripts/check-notes-canvas.mjs`
- `docs/design-docs/canvas-workspace-runtime.md`

### Validation

- `pnpm check`、`pnpm build`、`node scripts/check-notes-canvas.mjs` 通过。
- 已确认保存、退出并重启本地 App，打开文稿内画布检查顶部与按钮位置。
- 自动化拖动直接向 App 投递事件，未触发 macOS 窗口服务器移动；原生拖窗手感仍需人工确认，未将此次操作记为拖窗成功。
