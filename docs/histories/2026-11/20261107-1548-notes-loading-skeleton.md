## 2026-11-07 15:48 | Task: 文稿加载骨架贴合真实布局

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 去掉正在打开文稿的提醒，骨架遵循当前侧栏状态、文稿列表与正文布局，让加载无感。

### 🛠 Changes Overview

**Scope:** `packages/ui`

- 两层 Suspense 和文稿数据等待统一复用 `NotesLoading`。
- 复用侧栏折叠状态、保存宽度和响应式布局；正文占位沿用路径栏、标题和文章留白。
- 去掉可见加载文案，保留辅助技术状态与原有读取错误；Canvas 懒加载使用安静的底色。
- 低对比占位动效支持减少动态效果偏好；窄屏标题同步真实字号与行高。

### 🧠 Design Intent (Why)

加载只替换尚未读取的内容，不重建不同形态的页面，避免通用列表、状态文字和正文之间的跳动。

### 📁 Files Modified

- `packages/ui/src/writing/NotesLoading.tsx`
- `packages/ui/src/writing/notes-loading.css`
- `packages/ui/src/App.tsx`
- `packages/ui/src/pages/NotesWorkspace.tsx`
- `packages/ui/src/pages/Notes.tsx`
- `docs/UIUX_REFERENCE.md`

### Validation

- 类型检查和生产构建通过。
- 隔离浏览器真实 App + 延迟本地文稿响应：检查展开 / 折叠、288px 保存宽度、浅深色与 390px 窄屏，并对比加载前后正文区域 / 路径栏 / 标题坐标。
- 本机独立 Electron 回归窗口在 ready 前超时（既有 outline 脚本亦同），未计为通过；改用浏览器隔离预览核对骨架。
- Nomi(Dev) 已重启，Computer Use 验证文稿恢复与侧栏切换；正式 App 和用户文稿未修改。
