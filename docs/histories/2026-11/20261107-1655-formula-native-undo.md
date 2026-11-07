## [2026-11-07 16:55] | Task: 验证公式输入撤销与重做

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> LaTeX 编辑框应像普通输入框一样支持 Command+Z 撤销输入。

### 🛠 Changes Overview

**Scope:** 文稿回归脚本与设计文档。

- 当前公式输入框已使用原生 textarea；上一轮同步交接焦点修复后，本轮未复现无法撤销的问题，不新增自定义撤销栈。
- 扩展原生 Electron smoke 回归，输入后调用原生 undo / redo，检查源码、公式预览、焦点与编辑高亮。
- 文档明确输入框内部撤销边界。

### ✅ Validation

- Nomi(Dev) 合成文稿实际验证：粘贴后 Command+Z、键盘输入后 Command+Z、Command+Shift+Z 重做、全选删除后撤销恢复，均只作用于公式输入并同步预览。
- 本轮未运行完整文稿 smoke；新增脚本通过语法检查。
- 未修改正式版或用户正文。

### 🧠 Design Intent (Why)

保留原生输入框历史和平台快捷键，不为了未复现的现象重复实现撤销系统。通过回归覆盖焦点修复与原生历史之间的契约。

### 📁 Files Modified

- `scripts/check-notes.mjs`
- `docs/design-docs/notes-authoring.md`
