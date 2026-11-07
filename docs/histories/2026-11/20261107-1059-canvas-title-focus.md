## 2026-11-07 10:59 | Task: 修复内嵌画布焦点

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop

### 用户诉求

画布名称点击其他位置后结束输入；从正文按回车打开画布不应自动选中 Close。

### 改动与原因

- Canvas 在指针捕获阶段处理名称输入框的外部点击，先失焦提交，再交给画布手势。避免拖动逻辑 preventDefault 阻止浏览器默认焦点转移。
- Modal 支持显式初始焦点目标；内嵌画布选择画布表面，并在懒加载完成时补齐焦点。保留键盘 Tab 主动导航的可见反馈。
- 同步文稿交互约定与隔离回归脚本。

### 验证

- 类型检查、构建、完整内嵌 Canvas 专项通过。
- 新回归覆盖双击 / 回车打开后的画布焦点、原生鼠标外部点击结束重命名、持久化重开；已有历史、绘制、连线、窄屏、离线检查通过。
- 检查初始焦点和重命名后截图；仅重启 Nomi(Dev)，Computer Use 实测正文回车进入、修改名称并点击画布、Esc 返回。

### 关键文件

- `packages/ui/src/components/primitives.tsx`
- `packages/ui/src/canvas/EmbeddedCanvasBlock.tsx`
- `packages/ui/src/pages/Canvas.tsx`
- `scripts/check-notes-canvas.mjs`
- `docs/design-docs/notes-authoring.md`
