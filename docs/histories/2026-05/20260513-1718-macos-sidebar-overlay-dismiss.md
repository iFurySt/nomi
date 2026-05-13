## [2026-05-13 17:18] | Task: macOS sidebar and Add overlay polish

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local macOS workspace`

### User Query

> 调整左侧边栏内部项目的左右间距和行项目观感，色调保持现有 Nomi 风格；右上角 `+` 打开的 Add 弹窗在点击页面其他地方、失焦或按 Esc 时自动关闭。

### Changes Overview

**Scope:** `apps/macos/Nomi`

**Key Actions:**

- **Sidebar sizing**: 给 `NavigationSplitView` sidebar 明确 min / ideal / max 列宽，避免大窗口下系统 `.balanced` 布局把侧栏拉得过宽。
- **Sidebar row density**: 对照 Landmarks 原生 `List` sidebar 写法，继续收窄 sidebar 列宽、profile / 导航行 / 设置行的 row inset、行高、图标和文字尺寸，保留现有暖灰侧栏。
- **Sidebar selection tone**: 将选中行从近黑改为更柔和的深暖灰，降低选中态压迫感。
- **Add overlay dismiss**: Add overlay 外层命中区域铺满窗口，并增加 Escape 与应用失焦关闭监听；图片导入或保存中仍避免误关。
- **Docs sync**: 同步更新 macOS 前端行为说明和架构说明。

### Design Intent (Why)

macOS sidebar 应该优先保持系统侧栏的克制密度，不能在宽窗口下被拉成过宽的自定义导航面板。Add overlay 属于临时捕获入口，应表现得更接近系统浮层：点击外部、按 Esc 或应用失焦都能退出，同时避免在保存或图片导入过程中丢失操作状态。

### Files Modified

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/histories/2026-05/20260513-1718-macos-sidebar-overlay-dismiss.md`
