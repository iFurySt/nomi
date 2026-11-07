## [2026-11-07 16:16] | Task: 收敛公式编辑与对齐交互

### Execution Context

- Agent: `/root`
- Runtime: Codex desktop

### User Query

公式默认左对齐，编辑时保留实时渲染结果；移除多余的完成提示。再次点击公式收起源码并展示对齐工具栏，悬停底色仅覆盖公式本身。

### Changes

- 源码面板优先定位在公式下方，移除提示行；编辑继续实时更新公式并保留已有对齐设置。
- 点击公式切换源码编辑，收起后提供编辑与左 / 中 / 右对齐按钮，复用文字工具栏和 Tooltip 样式。
- 公式悬停、选中高亮限制在内容区域，默认左对齐；显式对齐通过 LaTeX 注释保存，读取仍支持已有三种标记。
- 防止原生鼠标选区干扰公式点击，工具栏锚点读取当前编辑器，未聚焦时不显示初始节点工具栏。
- 更新文稿设计契约和公式回归断言。

### Files

- `packages/ui/src/writing/FormulaPopover.tsx`
- `packages/ui/src/writing/FormulaToolbar.tsx`
- `packages/ui/src/writing/RichMarkdownEditor.tsx`
- `packages/ui/src/writing/mathSource.ts`
- `packages/ui/src/writing/writing.css`
- `packages/ui/src/writing/tableOutput.test.ts`
- `scripts/check-notes.mjs`
- `docs/design-docs/notes-authoring.md`

### Validation

类型检查、生产构建及公式 / 表格输出的 4 项单测通过。隔离浏览器 fixture 验证点击切换、三种对齐、实时编辑保留对齐和内容宽度高亮。重启 Nomi(Dev)，在合成测试文稿实际验证源码输入、实时渲染、重复点击切换、左右对齐、Esc 收起和保存；检查实际窗口截图。未运行完整 Notes smoke，未操作正式版或真实写作文稿。
