## 2026-11-07 15:53 | Task: 合并文稿面包屑与轻量保存反馈

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 文稿路径合并到 App 顶部，仅保留一处；没有自定义图标不显示文件图标。去掉右上角保存勾号，路径后用呼吸小点表示保存中，避免干扰写作。

### 🛠 Changes Overview

**Scope:** `packages/ui`、桌面设计规范

- 新增 `WorkspaceTitle`，页面将自身标题渲染到 Shell 的唯一顶部位置；桌面和 Web 共用，独立页面宿主保留本地标题兼容。
- 正文头栏删除；祖先文稿仍可点击，长名称保留省略。面包屑只显示自定义图标，文稿列表图标不变。
- 保存状态替换为固定占位的 4px 中性色呼吸点，保存完成后不可见，减少动态效果时静止。失败通知与重试仍保留，不改写保存机制。
- 加载骨架同步使用顶部标题位置，避免文稿打开时再次出现内部头栏。

### 🧠 Design Intent (Why)

路径与保存反馈属于导航层，正文只保留阅读与编辑。标题通过 portal 传递，不复制文稿状态到 Shell，也不因保存反馈移动正文或输入焦点。

### 📁 Files Modified

- `packages/ui/src/components/WorkspaceTitle.tsx`
- `packages/ui/src/components/Shell.tsx`
- `packages/ui/src/pages/Notes.tsx`
- `packages/ui/src/writing/NoteBreadcrumb.tsx`
- `packages/ui/src/writing/NotesLoading.tsx`
- `packages/ui/src/writing/writing.css`
- `packages/ui/src/styles.css`
- `docs/UIUX_REFERENCE.md`
- `docs/design-docs/desktop-design.md`

### Validation

- `pnpm check`、`pnpm build`、`git diff --check` 通过。
- 隔离浏览器 fixture 使用实际 App 和合成父子文稿，检查唯一顶部路径、自定义 emoji / 无默认图标、父级跳转、长标题、浅深色、640px 窄窗口。
- 模拟延迟保存与失败：待保存时圆点呼吸，完成后透明；路径 x 坐标不变，输入焦点留在编辑器，错误与重试可见。
- 仅重启 Nomi(Dev)，实际窗口截图检查通过；正式版与用户文稿未修改。
