## [2026-11-07 11:10] | Task: 整理画布形状轮廓与悬浮条

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 移除图形上方无法点击的悬浮条；圆角矩形改为飞书那样的小圆角，并对齐基础形状。

### 🛠 Changes Overview

**Scope:** core / ui / Electron 验证 / docs

- shape 不再渲染旧卡片标题和操作条，保留双击文字编辑与选中属性栏。
- 圆角矩形按实际宽高计算 8 世界单位的圆弧，胶囊使用短边一半；预览、绘制结果、旋转与连线轮廓一致。
- 基础目录对齐飞书 25 项并新增胶囊 / 五边箭头，保留立方体、文档和文本，合计 28 类型。调整对话框、星形与立方体轮廓，图标区分普通圆角与胶囊。
- 通过 OBU 查看指定飞书画板与形状面板，未编辑参考内容、未复制第三方代码。

### 🧠 Design Intent (Why)

原实现将正方形的圆角非等比拉伸，导致宽矩形角变成扁椭圆。尺寸相关的语义路径保持视觉和吸附一致，继续允许未来原生 renderer 按同一规则实现。

### 📁 Files Modified

- `packages/core/src/canvas/{document,shapes,geometry}.ts`
- `packages/ui/src/canvas/{ShapeGlyph,CanvasShapeContent,CanvasShapeCursor}.tsx`
- `packages/ui/src/pages/Canvas.tsx`
- `packages/ui/src/canvas/canvas.css`
- `scripts/check-canvas-shapes.mjs` 与相关 fixture / 回归
- `docs/design-docs/canvas-selection-and-layout.md`
- `docs/references/canvas-interactions.md`

### Validation

- 类型检查、生产构建通过。
- Canvas core：17 文件 / 186 测试通过，包含宽 / 高 / 最小尺寸、四种旋转、胶囊与端口。
- 全 28 类型原生鼠标专项通过，覆盖四方向拖绘、Shift、Esc、对齐 / Alt / 锁轴、8 个缩放热区、Undo / Redo。
- 内嵌 Canvas 回归通过：预览、编辑、连线、历史、隔离、重开、窄屏与离线。
- 总览截图与开发版实际圆角矩形 / 双击文字 / 选中工具栏验收完成，仅重启开发版。
- 扩展运行完整 `check-canvas.mjs` 未通过：首次原生拖动的旧断言未计入自动对齐；临时排除吸附后，笔记八向缩放 NE 用例命中其他卡片，尚未确认原因。未将排查性修改或放宽断言保留；本次全部形状专项与内嵌回归通过，不宣称全量 Canvas 回归通过。
