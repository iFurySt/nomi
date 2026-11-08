## [2026-11-07 23:20] | Task: 文稿 AI 直接生成交互块

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 文稿 AI 当前仍然绘制画布，需要生成可操作的交互块。

### 🛠 Changes Overview

**Scope:** core、host、UI、生成回归与设计文档。

- 文稿改用独立 host 提示词，保留标题 / 选区 / 邻近正文上下文与现有无工具通道。
- 文稿只接收原生交互块与短说明，至少一个有状态绑定的控件；移除形状 / 连线整体包装成画布的回退。
- 流式前缀和最终结果分别校验，超出能力范围简短提示；失败清除临时预览且不写入正文。
- 原生块沿用 learner state、渲染与一次插入事务，Canvas 生成保持原行为。

### 🧠 Design Intent (Why)

根因是文稿沿用画布系统提示，且不支持的仿真被要求回退到说明图；结果只要含形状就整体包入 canvas。修复生成契约与插入边界，避免把静态说明误当成交互。此轮不扩展 portable IR 的组件或运算，不伪装成可执行任意仿真的运行时。

### 📁 Files Modified

- `packages/host/src/canvas-generation-prompt.ts`、`chatgpt.ts`
- `packages/core/src/canvas/generation.ts`
- `packages/ui/src/canvas/GenerateCanvas.tsx`、`pages/Notes.tsx`、`writing/noteAI.ts`
- 对应单元测试、`scripts/check-note-generation.mjs` 与隔离 fixture
- `docs/design-docs/canvas-ai-generation.md`、`notes-authoring.md`、`docs/ARCHITECTURE.md`

### 验证

- 36 项定向单元测试通过：core 生成、host 请求与文稿插入。
- `pnpm check`、`pnpm build` 通过；构建仍有既有 chunk size 提示。
- `node scripts/check-note-generation.mjs`：原生交互块、滑块改变实时概率、保存重开、原子撤销重做、拒绝静态图 / 不支持交互、取消与过期位置均通过；已检查生成结果截图。
- `node scripts/check-canvas-generation.mjs` 通过：原画布流式图形 / 连线没有回归。
- 仅退出并重启 Nomi(Dev)，通过实际 UI 验证 `/ai` 入口。开发版未连接账号，因此生成验证使用隔离模拟响应，在线推理尚未验收。未访问正式版数据与 Transformer。
