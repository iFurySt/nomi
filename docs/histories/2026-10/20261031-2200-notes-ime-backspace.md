## [2026-10-31 22:00] | Task: 修复中文组合输入退格中断

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex Desktop

### 📥 User Query

> 拼音输入 zaiyu，候选词出现后删除 yu，候选框消失；修复 Nomi 输入区的这一问题。

### 🛠 Changes Overview

**Scope:** UI writing / regression scripts / docs。

- 在真实 App 和 Chromium marked-text 通道复现删除后拼音残留 / 重复，空格不能选词。
- 跟踪至 ProseMirror DOM 解析触发的 Backspace keymap：Tiptap 的未命中命令提交语义空事务，以旧 state 更新 view 中断组合范围。
- `WritingComposition` 仅在 composing 期间过滤无内容、选区、marks、metadata 修改的空事务；不接管原生删除，也不阻止实际编辑。
- 增加 `smoke:notes-ime`，使用真实 Chromium composition / commit，验证六类正文位置、取消重输、退格、撤销重做和保存重开；禁用 guard 的负对照稳定失败。

### 🧠 Design Intent (Why)

在破坏 marked range 的具体事务入口修复，保留现有列表、撤销与自动保存语义，不通过吞键或重建整个编辑器掩盖问题。

### 📁 Files Modified

- `packages/ui/src/writing/WritingComposition.ts`
- `packages/ui/src/writing/RichMarkdownEditor.tsx`
- `scripts/check-notes-ime.mjs`、`package.json`
- `docs/design-docs/notes-authoring.md`、`docs/QUALITY_SCORE.md`、发布记录。

### 验证

类型检查、生产构建、IME 专项及完整 `smoke:notes` 通过；Computer Use 正式 App 重启后，实际系统拼音输入 zaiyu，删除两次保留 marked zai，再空格得到“在”。截图见 `docs/generated/verification/nomi-ime-commit-live-2026-10-31.png`。临时文稿删除可恢复，原有文稿未修改，恢复用户原来的文稿与列表宽度。保留既有未提交修改，未提交推送。
