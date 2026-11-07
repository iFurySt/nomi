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

### 2026-11-07 代码块交互收敛

- 静止头部只保留灰色说明，折叠保留展开箭头；悬停或键盘操作显示工具，菜单打开期间保持可见。
- 说明原位编辑去除底色，聚焦占位简化为“代码块名称”；换行 / 复制悬停样式提高选择器优先级，避免文稿通用按钮底色覆盖。
- CodeBlock 的 Mod-a 仅选择当前代码正文，重复按键不扩展范围，保留普通正文与标题输入的原生全选。
- 类型、生产构建及代码块 Electron 专项通过，新增静止 / 悬停 / 折叠 / 标题编辑截图、全选两次、替换不越界和撤销检查；深浅色与窄屏截图保留。
- 仅重启 Nomi(Dev)，实际窗口复核灰色说明原位编辑、工具显示与代码内连续两次全选，截图已检查；未修改正式版文稿。

### 2026-11-07 代码块高度

- 悬停显示蓝色边框与底部短拖动柄，默认仍按内容自适应。拖动实时预览，松手单次保存固定视口高度，代码内部滚动且头部固定；折叠保留高度，双击拖动柄恢复自适应。
- 编辑器与阅读预览共用 CodeViewport；围栏可选 `height` 字段及 HTML 往返保留高度。阅读预览的调整仅影响本地状态，缩放画布中的指针位移按实际比例换算。
- 拖动支持取消、撤销 / 重做，键盘上下键微调与 Home 恢复自适应；高度校验避免无效值破坏布局。
- 类型、生产构建、4 项元数据单测及代码块 Electron 专项通过，覆盖拖动中不保存、松手后内部滚动、撤销 / 重做、重新解析、折叠 / 展开与恢复自适应。已检查固定高度、深浅色与窄屏截图。
- 仅重启 Nomi(Dev)，在独立示例实际拖动缩小并滚动，确认头部与文稿位置稳定、代码内部滚动。未操作正式版。
