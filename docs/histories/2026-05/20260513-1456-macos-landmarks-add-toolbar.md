# macOS Landmarks Add Toolbar

## 用户诉求

用户指出右上角搜索和添加按钮不应继续使用自定义样式，也不应连成一组；要求先只保留一个参考 Landmarks Collections 页面写法的右上角原生 `+` 按钮，搜索暂时不要。

## 主要改动

- 删除 macOS toolbar 里的搜索按钮、展开搜索框和自定义 glass / circle 样式。
- 删除临时的 titlebar accessory / 自定义圆形按钮实现，避免偏离系统 toolbar。
- 将右上角 Add 收敛为 Landmarks Collections 同款 SwiftUI toolbar 写法：`ToolbarItem(placement: .automatic)` 内放默认 `Button` 和 `Image(systemName: "plus")`。
- 保留系统 `navigationTitle`，让“概览”等 section title 继续作为系统 titlebar 文本显示。
- 按用户试验要求将 macOS 窗口最小宽度调整到 `500`，用于观察极窄窗口下系统 toolbar overflow 行为。
- 更新架构和前端文档，记录 macOS toolbar 当前只保留原生 `+` Add 按钮，搜索入口暂不放回 toolbar。

## 设计动机

- macOS 26 toolbar 的按钮组和 Liquid Glass 视觉应优先交给系统决定，不在 titlebar 里手写相似控件。
- 在搜索按钮视觉尚未定稿前，先把 toolbar 范围收窄到一个官方参考里最简单的 Add 按钮，降低继续误判的空间。

## 受影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `apps/macos/Nomi/Sources/Nomi/NomiApp.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- 打开 `.build/Nomi.app` 后截图检查：标题使用系统 titlebar 文本，右上角只出现一个系统 toolbar `+` 按钮，搜索按钮不存在。
