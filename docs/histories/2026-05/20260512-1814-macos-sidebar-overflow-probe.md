# macOS Sidebar Overflow Probe

## 用户诉求

用户截图指出窗口中部仍出现 `>>`，并追问为什么会继续触发。

## 主要改动

- 新增独立 SwiftPM executable `SidebarProbe`，只保留原生 `NavigationSplitView`、sidebar `List` 和简单 detail 内容，用来隔离系统 sidebar 行为。
- 新增 `apps/macos/Nomi/scripts/build-sidebar-probe.sh`，可单独构建 `.build/SidebarProbe.app` 进行可视化验证。
- 移除主 App 内容头部里的自定义 sidebar toggle，不再把 `NavigationSplitView` 切到 `.detailOnly`。
- 主 App 保持 window toolbar hidden，并由内容区 header 承载搜索和添加入口，避免触发系统恢复 sidebar 的窗口级按钮。

## 根因判断

`>>` 不是 401 请求导致的。它来自 macOS / SwiftUI 对 `NavigationSplitView` 的系统恢复控件：当代码把 sidebar 收成 `.detailOnly` 后，系统会尝试在窗口 chrome 里提供一个恢复入口。主 App 同时隐藏了 window toolbar，所以这个恢复控件会以异常显眼的位置出现在窗口中部。

## 受影响文件

- `apps/macos/Nomi/Package.swift`
- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `apps/macos/Nomi/Sources/SidebarProbe/SidebarProbeApp.swift`
- `apps/macos/Nomi/scripts/build-sidebar-probe.sh`

## 验证

- `cd apps/macos/Nomi && swift build --product SidebarProbe`
- `cd apps/macos/Nomi && scripts/build-sidebar-probe.sh`
- `cd apps/macos/Nomi && scripts/build-app.sh`
- 打开 `.build/Nomi.app` 后用 System Events 检查：主 App 当前窗口 `toolbarButtons=0`。
