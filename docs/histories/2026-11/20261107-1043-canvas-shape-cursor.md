## [2026-11-07 10:43] | Task: 图形放置预览与菜单提示

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 选择形状后显示跟随鼠标的半透明图形；菜单里的具体形状、连线显示名称和实际快捷键，没有快捷键则只显示名称。

### 🛠 Changes Overview

**Scope:** `packages/ui`、画布交互验收脚本和运行时文档。

- 新增独立的图形光标预览：鼠标为左上角，默认 180×120 世界单位，与单击实际放置一致。预览不写入数据，指针移动只更新预览元素，不触发整幅画布重渲染。
- 形状选项上方、连线选项右侧显示紧凑气泡，复用现有工具提示样式；取消原生 title 避免重复提示。
- R / D / O 分别启用圆角矩形 / 菱形 / 椭圆，L 启用无箭头直线，其他选项不展示虚构快捷键。
- 增加菜单提示、预览位置 / 缩放尺寸、实际单击落点和取消检查；支持 `--tools-only` 独立运行。

### 🧠 Design Intent (Why)

让用户放置前就看到当前形状与尺寸；功能说明按需出现在指针附近，不增加常驻文字。

### 📁 Files Modified

- `packages/ui/src/canvas/CanvasShapeCursor.tsx`
- `packages/ui/src/canvas/CanvasToolMenu.tsx`
- `packages/ui/src/canvas/canvas.css`
- `packages/ui/src/pages/Canvas.tsx`
- `scripts/check-canvas-shapes.mjs`
- `docs/design-docs/canvas-workspace-runtime.md`

### Validation

- 类型检查、桌面构建、工具专项及完整 26 类形状指针回归通过。
- 已检查隔离场景中的预览、带快捷键 / 不带快捷键气泡截图。
- 实际 App 保存后重启，Computer Use 检查菜单选择、Esc 返回选择工具；未修改用户文稿内容。
