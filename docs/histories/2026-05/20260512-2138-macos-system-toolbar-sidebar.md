# macOS System Toolbar Sidebar

## 用户诉求

用户要求删除 `SidebarProbe`，把主 macOS 应用恢复到之前完整 UI 的版本继续修复，并参考 Calendar / Landmarks 的方式处理 toolbar：保留系统 sidebar 折叠行为，titlebar 里只需要面包屑、搜索和添加三个小入口。

## 主要改动

- 移除临时 `SidebarProbe` target 和构建脚本，不再保留独立探针入口。
- 将主 macOS `ContentView` 恢复为完整健康 dashboard / records / overlay 版本。
- 放弃 `NSTitlebarAccessoryViewController` 自定义 titlebar accessory 方案，改回 SwiftUI 系统 toolbar。
- 保留系统 `NavigationSplitView` sidebar toggle，不再隐藏 `.sidebarToggle`，让 macOS 自己管理折叠按钮。
- toolbar 只保留当前 section title、搜索按钮 / 搜索框、添加按钮，去掉会挤压系统 toolbar 的假 spacer。
- 降低 macOS 窗口最小宽度，并给 sidebar 设置 `minWidth: 180, idealWidth: 220`，避免正常窗口宽度下过早触发 `NSToolbar` overflow `>>`。

## 结论

`>>` 是 macOS `NSToolbar` 的 overflow 表现，不是接口错误或 sidebar 逻辑错误。Landmarks 在窗口极窄时也会出现该表现；主应用的问题是窗口和 toolbar 项约束过宽，导致正常尺寸下过早进入 overflow。

## 受影响文件

- `apps/macos/Nomi/Package.swift`
- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `apps/macos/Nomi/Sources/Nomi/NomiApp.swift`
- `apps/macos/Nomi/scripts/build-app.sh`

## 验证

- `cd apps/macos/Nomi && scripts/build-app.sh`
- 打开 `.build/Nomi.app`，在默认宽度下确认系统 sidebar toggle、section title、搜索、添加正常显示，无 `>>`。
