# macOS record state reset

## 用户诉求

记录内页存在状态残留：进入记录内页后切到概览等其他 sidebar 页面，toolbar 返回 icon 仍然存在；再次进入记录页也会回到之前的内页，应该回到记录列表。

## 改动

- 将 sidebar 选择改为统一走 `selectSection(_:)`。
- 切换到非记录 section 时清空 `expandedRecordID` 和 `selectedRecordID`。
- toolbar 返回 icon 只在当前 section 是记录且存在放大记录时显示。
- 头像菜单里的设置入口也复用同一个 section 切换路径。
- 后续补强：sidebar 任意切换都会清空记录内页与右侧预览状态，点击“记录”也回到记录列表。
- 后续补强：返回 icon 从全局 `NavigationSplitView` toolbar 挪到记录内页自身 toolbar，并为 detail 页面增加 route identity，避免 SwiftUI 复用旧 toolbar。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
