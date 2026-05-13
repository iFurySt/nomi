# macOS record scrollbars

## 用户诉求

记录页里的滚动条需要隐藏，避免干扰当前安静、低装饰的桌面端界面。

## 改动

- macOS 记录列表的垂直 `ScrollView` 隐藏系统滚动条。
- macOS 记录右侧详情预览的垂直 `ScrollView` 隐藏系统滚动条。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
