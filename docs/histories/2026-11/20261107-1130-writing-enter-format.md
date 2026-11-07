## [2026-11-07 11:30] | Task: 回车后恢复默认文字格式

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 一行设置斜体或加粗等格式后，回车应恢复默认格式。

### 🛠 Changes Overview

- `WritingStarterKit` 统一关闭行内 mark 的 `keepOnSplit`；沿用编辑器的段落 / 列表 / 软换行命令，下一行的输入不继承格式。
- 不清除已经存在的文字样式，包括段中换行后移动到下一行的后半段；不改变列表结构、不拦截输入法按键。
- 文稿编辑契约与独立 Electron 回归同步更新。

### 🧠 Design Intent (Why)

用编辑器原生格式继承机制实现默认行为，避免额外键盘拦截干扰中文输入法、斜杠菜单、撤销和列表拆分。

### 📁 Files Modified

- `packages/ui/src/writing/WritingStarterKit.ts`
- `packages/ui/src/writing/RichMarkdownEditor.tsx`
- `scripts/check-notes-enter-format.mjs`
- `docs/design-docs/notes-authoring.md`

### Validation

- 类型检查、生产构建通过。
- 12 个原生换行场景通过：粗体、斜体、删除线、行内代码、组合样式、无序 / 有序 / 待办列表、引用、标题、段中拆分与 Shift+Enter。
- 中文 IME 回归通过，覆盖拼音删除、候选提交 / 取消、选区替换、历史和保存重开。
- 仅重启 Nomi(Dev)，独立测试文稿中实际输入粗体 / 斜体并回车，截图确认后续文字为默认样式，保存成功。
