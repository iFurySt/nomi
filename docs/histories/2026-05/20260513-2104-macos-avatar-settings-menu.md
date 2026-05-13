# macOS avatar settings menu

## 用户诉求

左侧 sidebar 底部的设置入口需要移除，设置应该放到顶部头像点击展开的菜单里。

## 改动

- 移除 sidebar 底部独立“设置”行。
- 顶部头像 / Leo 行改为菜单入口。
- 头像菜单内提供带 gear 图标的“设置”项，点击后进入当前“我的”区域。
- 删除不再使用的 `SidebarUtilityRow`。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
