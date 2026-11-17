## [2026-11-16 23:48] | Task: 修复交互块复制粘贴与失败提示

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6 系列 Codex
- **Runtime**: Codex desktop

### 📥 User Query

> 新版内容粘贴到旧版的错误改成顶部居中 toast；交互块右上角复制后，粘贴到另一篇文稿应恢复交互块。

### 🛠 Changes Overview

**Scope:** UI、交互块剪贴板与文稿回归。

- 复制同时写入带语义标记的 HTML 与 JSON DSL；支持纯文本、代码围栏和旧块包装。
- 识别后严格验证，成功生成独立块，失败阻止文本降级并保留正文和焦点。
- 一次性操作错误进入全局顶部 toast；持续保存失败和恢复操作保持原入口。
- 补充单测、跨文稿隔离 Electron 回归与视觉证据。

### 🧠 Design Intent (Why)

复制的是可重用的交互内容，外部仍能读取 DSL；失败反馈轻量、不影响书写。没有放宽 DSL 校验或赋予旧版应用新组件能力。

### 📁 Files Modified

- `packages/ui/src/interactive/clipboard.ts`、`clipboard.test.ts`、`InteractiveTools.tsx`
- `packages/ui/src/pages/Notes.tsx`、`packages/ui/src/styles.css`
- `scripts/check-interactive-authoring.mjs`
- `docs/UIUX_REFERENCE.md`、`docs/design-docs/notes-authoring.md`、`docs/QUALITY_SCORE.md`

### 验证与边界

7 项专项单测、`pnpm check`、`pnpm build`、`make ci` 和 diff 检查通过。隔离 Electron 验证 HTML / 纯文本跨文稿粘贴、独立副本、编辑撤销、不兼容粘贴不改正文、不抢焦点及 toast 自动消失；原框选回归通过。截图：

- [浅色](../../generated/verification/20261116-interactive-paste-toast-light.png)
- [深色窄屏](../../generated/verification/20261116-interactive-paste-toast-dark-narrow.png)

开发版实际应用控制连续超时，不能确认保存状态和重启，没有强制退出。正式版、真实文稿及真实剪贴板未用于回归。未提交、推送或发布。
