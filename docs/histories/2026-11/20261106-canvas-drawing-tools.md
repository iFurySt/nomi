## 2026-11-06 | Task: 整理画布工具与拖动绘制

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop

### User Query

> 左栏按 AI / 选择 / 平移、绘制、插入、模板 / DSL 四组排列并垂直居中；形状和连线 hover 选择，形状拖动绘制；Text 提示快捷键；Close / 名称紧凑、下移避开窗口按钮，旁边提供撤销重做。

### Changes

- 共用全局和文稿内画布工具栏，新增悬停提示与三种绘图入口。
- 形状选择不新增内容，拖动时预览，松开提交一次；支持反向拖动、取消、尺寸约束、快捷键及历史。默认圆角矩形；Text 新建后进入编辑。
- 连线菜单选择无箭头直线 / 直线箭头 / 圆角折线 / 曲线，预览与提交使用同一模式。
- 顶部标题和历史按钮避开 macOS 窗口控制，左栏居中，窄窗口支持滚动；移除空形状的冗余文字。
- 更新 Electron 手势回归；旧路由专项使用独立种子，悬停工具面板不再被误判为阻塞对话框。

### Validation

- 类型检查、生产构建、文稿内画布专项与完整 Canvas 回归通过。
- 原生指针覆盖悬停、提示、反向拖绘、提交前无实体、Esc 取消、T 创建、四种连线和撤销重做；保存 / 重开 / 隔离 / 窄屏 / 离线仍通过。
- 已重启真实 App，Computer Use 检查画布体验页、工具排列、顶部安全距离和菜单；实际截图与隔离截图存于 `.artifacts`。没有修改 Transformer 文稿。

### Files

- `packages/ui/src/pages/Canvas.tsx`
- `packages/ui/src/canvas/CanvasToolMenu.tsx`
- `packages/ui/src/canvas/CanvasShapeContent.tsx`
- `packages/ui/src/canvas/canvas.css`
- `scripts/check-notes-canvas.mjs`
- `scripts/check-canvas.mjs`
- `scripts/canvas-parity-checks.mjs`
- `docs/design-docs/canvas-workspace-runtime.md`
