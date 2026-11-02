## 2026-11-02 | Task: 文稿面包屑与固定设置导航

### Execution Context

- Codex `/root`，本机桌面工作区。

### User Query

> 文稿添加类似参考图的面包屑；设置页面不需要折叠图标，也不允许折叠。

### Changes

- 文稿祖先路径从正文移至顶部，补齐当前文稿、Emoji / 图片 / 默认图标及父级跳转；复用既有选择 / 保存流程。
- 面包屑长标题省略，窄屏 / 深层级横向滚动，切换文稿和调整尺寸时保持当前项可见。
- 设置页隐藏折叠入口，禁用对应快捷键，独立于文稿折叠偏好；窄屏改为始终可见的分类栏。
- 新增隔离 Electron 导航回归与截图，同步文稿和桌面契约。

### Validation

类型检查、生产构建、`make ci` 和 `check-notes-navigation.mjs` 通过，覆盖父级导航、根页、内容 revision 不变、深浅色 / 窄屏与设置折叠限制。已正常退出旧 App 并启动本地新构建，通过 computer use 与实际截图确认文稿顶部路径、图标和保存状态；设置页没有折叠入口，按 ⌘B 后分类栏仍保持显示。返回文稿后保留原选中文稿，未编辑用户正文。隔离测试截图位于 `.artifacts/notes-navigation/`。

### Main files

- `packages/ui/src/writing/NoteBreadcrumb.tsx`
- `packages/ui/src/pages/Notes.tsx`
- `packages/ui/src/components/Shell.tsx`
- `packages/ui/src/writing/writing.css`
- `packages/ui/src/styles.css`
- `scripts/check-notes-navigation.mjs`
