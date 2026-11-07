## 2026-11-07 10:56 | Task: 简化画布 AI 并流式绘制

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop

### 用户诉求

将冗长生成弹窗改为 chat 输入框；回车后动画收到右侧，在画布上逐块绘制内容与连线。

### 改动

- 紧凑输入、模型选择与发送；Enter / Shift+Enter / IME 处理，生成中短状态和停止按钮。
- 从真实响应 delta 提取完整命令，严格校验后渲染临时场景。复用画布内容与连线渲染，支持深色、窄屏、减少动态效果。
- 最终响应独立完整校验，一次插入与撤销；停止、关闭、账号变化和迟到输出均不遗留部分写入。
- 文档同步生成架构、验证边界和执行计划。

### 验证

- 生成核心 5 条单测、类型检查、构建通过。
- 隔离 Electron：逐块 / 连线、原子提交 / 撤销、非法输出、停止 / 关闭迟到输出、IME、深色 / 窄屏通过，并检查截图。
- 仅重启 Nomi(Dev)，Computer Use 确认新入口；正式版与真实文稿未操作。开发版未登录，本轮流式行为使用模拟响应验证，没有在线调用验收。

### 关键文件

- `packages/core/src/canvas/generation.ts`
- `packages/ui/src/canvas/GenerateCanvas.tsx`
- `packages/ui/src/canvas/CanvasGenerationPreview.tsx`
- `packages/ui/src/canvas/generation.css`
- `packages/ui/src/pages/Canvas.tsx`
- `scripts/check-canvas-generation.mjs`
- `docs/design-docs/canvas-ai-generation.md`
