## [2026-11-02 23:18] | Task: 文稿斜杠内容块菜单

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop，macOS

### User Query

> 文稿输入 `/` 时唤出添加 block 的菜单，参考飞书 / Notion。

### Changes Overview

- 独立段落 `/` 唤出紧凑菜单，中英文过滤，方向键 / Enter / Esc，鼠标选择；菜单复用已有 15 种块类型。
- 浮层锚定输入位置，上下避让、窄屏限宽、内部滚动，键盘选中项在调整窗口后保持可见。
- 组合输入期间不拦截候选按键；代码、URL、句中斜杠与嵌套结构保留文本语义。
- 普通块一次事务替换命令；附件 / 实验 / 文稿通过原有异步插入，校验命令原文与来源快照，取消保留输入。公式复用就地编辑。
- 修复 Tiptap 空标题序列化丢失类型，使撤销重做与重开保留标题；依赖与现有 Tiptap 固定版本一致。
- 生产重启验收发现编辑器尚未挂载时读取 DOM 导致白屏；改为按 mount / unmount 生命周期绑定监听，增加生产 bundle 同套回归。
- 同步写作契约，并更新完整文稿回归里旧子文稿列表选择器。

### Design Intent

用同一内容块目录与共享历史提供键盘入口，不引入第二份内容模型；异步选择取消和 IME 不丢字。

### Main Files

- `packages/ui/src/writing/SlashMenu.tsx` / `slash-menu.css`
- `packages/ui/src/writing/RichMarkdownEditor.tsx` / `WritingHeading.ts`
- `packages/ui/src/writing/BlockActions.tsx` / `blockOperations.ts`
- `packages/ui/src/pages/Notes.tsx`
- `scripts/check-notes-slash.mjs`

### Validation

- `pnpm check`、39 文件 / 291 单测、`pnpm build`、`make ci` 通过。
- 新隔离 Electron 回归覆盖原生输入、过滤、键盘选择、表格 / 文稿、取消、撤销重做、保存重开、视口与浅深色。
- `NOMI_SLASH_PRODUCTION=1 node scripts/check-notes-slash.mjs` 通过，直接验证产物中的挂载、输入和插入。
- 完整 `smoke:notes` 与 `smoke:notes-ime` 通过。
- Computer Use 在隔离窗口实际输入 `/table`、Enter 插入、表格编辑与撤销；截图检查通过。实际 Nomi 重启保留原有文稿，没有使用用户正文作为测试资料。
