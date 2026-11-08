## [2026-11-07 23:45] | Task: 文稿 AI 就地输入与连续调整

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop，macOS，本地开发仓库

### 用户诉求

`/ai` 输入框在光标或选区下面出现；发送后移到右上角，原位置显示生成中；完成后保留聊天并继续调整。

### 改动

- 共享生成输入框支持正文光标定位、滚动/尺寸变化跟随和视口避让；发送沿用停靠动画。
- 在原段落的视图装饰中显示呼吸骨架，完整块逐步到达后显示实际预览；不把半成品写入正文。
- 完成后保留会话和输入焦点，后续请求携带最近成功指令与完整结果，要求模型返回完整新版块组。
- 连续调整原子替换本会话生成的块；校验原结果仍连续且未改变，允许周围正文独立修改；取消/失败保持原结果，每轮可单独撤销。
- 会话内存隔离，关闭/导航取消请求，不接受迟到结果。Canvas 原有生成行为保持。

### 验证

- 针对性 Vitest：37 项通过；`pnpm check`、`pnpm build` 通过（已有 bundle size 提示）。
- 文稿 Electron 回归：光标/选区定位、骨架、流式原生交互、保留会话、历史传递、原位替换、单轮撤销、取消/失败、过期结果保护、重开进度、深色窄屏通过。
- Canvas Electron 生成回归通过；截图人工检查完成。
- 已重启 Nomi(Dev)，Computer Use 在线生成一个温度实验，再用下一条指令更改标题。结果仍是同一处的一个交互块，继续聊天框保留；滑块从 1 调至 2，概率显示随之更新。
- 仅新建开发验收文稿，不操作正式版与用户创作文稿。

### 关键文件

- `packages/ui/src/canvas/GenerateCanvas.tsx`
- `packages/ui/src/pages/Notes.tsx`
- `packages/ui/src/writing/NoteAIPreview.tsx`
- `packages/ui/src/writing/noteAI.ts`
- `packages/host/src/canvas-generation-prompt.ts`
- `scripts/check-note-generation.mjs`
