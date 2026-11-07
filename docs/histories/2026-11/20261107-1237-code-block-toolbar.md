## [2026-11-07 12:37] | Task: 整理文稿代码块

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 参考飞书代码块，左上可写说明，右上切换语言、换行并保留复制。

### 🛠 Changes Overview

**Scope:** `packages/ui`、文稿验证脚本与设计文档。

- 新增紧凑共享头部、可编辑说明、可搜索语言菜单、自动换行、折叠和原文复制；浅灰容器与逻辑行号统一编辑和阅读样式。
- 说明、语言、换行和折叠通过 Markdown fence info 保存，兼容无元数据旧代码块，保留未知元数据及不认识的附加信息；HTML 往返也保留设置。
- 行号按逻辑行随长行换行对齐，仍使用原有安全高亮和大代码回退，不执行代码。
- 新增元数据、阅读渲染和隔离 Electron 回归；IME 检查排除非编辑工具栏与视觉行号，继续严格核对实际输入原文。
- 同步 `notes-authoring.md` 的代码块契约。

### 🧠 Design Intent (Why)

把代码操作集中在同一条轻量头部，让代码说明与正文分离；沿用 Markdown 存储，避免增加新的块类型或破坏旧内容。

### 📁 Files Modified

- `packages/ui/src/writing/CodeBlock.tsx`
- `packages/ui/src/writing/CodeToolbar.tsx`
- `packages/ui/src/writing/CodeCopy.tsx`
- `packages/ui/src/writing/CodeContent.tsx`
- `packages/ui/src/writing/codeMetadata.ts`
- `packages/ui/src/writing/code.css`
- `packages/ui/src/canvas/Markdown.tsx`
- `packages/ui/src/writing/article-runtime.tsx`
- `scripts/check-notes-code-block.mjs`
- `scripts/check-notes-ime.mjs`
- `docs/design-docs/notes-authoring.md`

### Validation

- 类型检查、生产构建、基础 CI、6 项专项单测通过。
- 隔离 Electron 验证说明、语言、换行 / 行号、复制原文、折叠、Markdown / HTML 往返和 Escape 取消；浅深色 / 窄屏截图已复核。
- 完整中文组合输入专项通过，包括代码块、删除拼音、取消重输、撤销重做和保存重开。
- 解锁后仅重启 Nomi(Dev)，Computer Use 实测新建独立示例、说明编辑、搜索切换语言、换行与行号、折叠展开和系统复制成功；再次退出重开确认说明、语言和换行设置保留。实际窗口截图已检查，示例保留在开发版，正式版未参与测试。

### 0.2.1 补丁发布

- 按用户后续要求，根包和桌面版本递增为 0.2.1；新增代码块专项进入双架构发布门禁。
- 发布记录补充代码块能力，沿用现有 Developer ID 签名、公证和 Sparkle 更新流程。
