## 2026-11-07 13:55 | Task: 统一桌面悬停提示

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 导航和画布 popup 风格不一致，抽成共享组件，参考 ChatGPT 的圆角、文字和触发间距；发布继续后台跟踪。

### 🛠 Changes Overview

**Scope:** `packages/ui`、桌面交互回归、设计文档。

- 新增 Radix Tooltip 封装，统一深色无箭头气泡、12px 圆角、13px 常规文字、4px 间距和无描边快捷键。
- 导航、画布工具、文稿图标、外观、账号和更新入口共用组件；删除各自提示 CSS / 位置计算，保留实际操作菜单。
- Portal 避让视口，悬停不抢焦点；键盘聚焦可见，Escape / 点击 / 打开菜单关闭。

### 🧠 Design Intent (Why)

同一类轻提示只有一个实现和视觉规范，后续调整集中生效。菜单和提示保持不同职责。

### 📁 Files Modified

- `packages/ui/src/components/Tooltip.tsx`、`tooltip.css`
- `packages/ui/src/canvas/CanvasToolMenu.tsx`
- `packages/ui/src/components/{Shell,ProfileMenu,UpdateIndicator,AppearanceMode}.tsx`
- `packages/ui/src/writing/NoteIconPicker.tsx`
- `scripts/check-tooltips.mjs`、`scripts/check-note-icons.mjs`
- `docs/UIUX_REFERENCE.md`、`docs/design-docs/desktop-design.md`、`docs/design-docs/notes-authoring.md`

### Validation

- `pnpm check`、`pnpm build`、`make ci` 通过。
- Tooltip 专项 Electron 回归通过：原生悬停、触发间距与居中、跨入口样式一致、键盘激活、Escape、快捷键、菜单共存、深色及窄屏。
- 文稿图标完整回归、更新入口完整回归通过。
- 已审阅导航 / 画布 / 外观截图，并仅重启 Nomi(Dev)，通过 Computer Use 检查实际窗口的 Hand 提示。正式版及用户正文未改动。
- 本轮 UI 变更不包含在后台运行的 0.2.1 发布中。

### Follow-up: 形状菜单快速切换

- 创建形状 / 连线菜单沿用 CanvasToolButton 的共享提示，选中对象的形状切换菜单也改用 Tooltip。
- 关闭 Tooltip 的 hoverable grace 区域，离开触发图标立即关闭；实际菜单仍保留跨越间隙的容错。
- 专项回归增加相邻形状切换、离开后旧提示消失、快速来回移动时 DOM 无双提示、快捷键和菜单截图。
