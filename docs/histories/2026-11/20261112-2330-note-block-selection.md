## 2026-11-12 | Task: 正文留白框选与批量操作

### Execution Context
- Agent: /root
- Runtime: Codex desktop

### User Query
从正文两侧空白拖出选区，选择相交内容块并复制、剪切或删除。

### Changes
- 新增框选手势、逐帧选区高亮、边缘滚动与快速松手结算。
- Markdown 顶层单元与原子内容块共同选择，保留原生文字选择。
- 接入批量复制、剪切、删除、撤销及版本化剪贴板粘贴；共享块只解除当前引用，附件校验当前库原件。
- 更新文稿交互说明与执行计划。

### Validation
- blockSelection / blockOperations：13 项通过。
- 隔离 Electron：左右 / 反向框选、混合内容、复制剪切粘贴、删除撤销、跨屏滚动、Esc 和文字选择通过。
- 类型检查、桌面构建通过；仅重启 Nomi(Dev)，实际框选第二、三段并删除、撤销恢复通过。

### Key Files
- packages/ui/src/writing/useBlockSelection.ts
- packages/ui/src/writing/blockSelection.ts
- packages/ui/src/writing/blockSelection.test.ts
- packages/ui/src/pages/Notes.tsx
- packages/ui/src/writing/writing.css
- scripts/check-block-selection.mjs
