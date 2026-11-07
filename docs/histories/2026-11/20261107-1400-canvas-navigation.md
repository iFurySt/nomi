## 2026-11-07 14:00 | Task: 恢复启动页面与内嵌画布导航

### Execution Context
- Agent: `/root`
- Runtime: Codex desktop

### 用户诉求
首次进入文稿或恢复最后页面；内嵌画布顶部可拖动窗口；前进/后退包含内嵌画布；空画布占位更克制。

### 变更
- 保存有效工作区地址，首次和失效页面默认文稿，显式打开链接优先。
- 内嵌画布以 note + canvas 地址进入同一导航历史；后退返回所属文稿，前进恢复画布，Close / Esc 兼容直接链接。
- macOS 顶部保留 44px 原生拖动区域；移除全屏遮罩、弹窗和隐藏 shell 按钮对该区域的 no-drag 覆盖，编辑区域置于其下。
- 空场景仅显示「暂无内容」。
- 同步桌面 smoke 的文稿默认首页与旧路由回退断言。

### 验证
- 类型检查、生产构建、启动路由 3 单测、Notes navigation、Embedded Canvas、桌面 smoke 通过。
- 开发版实际 Cmd+[ 返回文稿、Cmd+] 重开，以及退出后恢复内嵌画布通过；检查空占位截图。
- 原生拖动自动化尚未取得窗口位移证据：同一工具对普通标题栏也未产生位移，不能仅凭 CSS 回归宣称实机拖动验收通过。

### 关键文件
- packages/ui/src/components/workspace-route.ts
- packages/ui/src/App.tsx
- packages/ui/src/canvas/EmbeddedCanvasBlock.tsx
- packages/ui/src/canvas/embedded-canvas.css
- scripts/check-notes-navigation.mjs
- scripts/check-notes-canvas.mjs
