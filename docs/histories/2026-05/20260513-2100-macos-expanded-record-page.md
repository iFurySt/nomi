# macOS expanded record page

## 用户诉求

记录右侧预览里的放大入口不要再打开弹窗，改成独立页面；左侧 sidebar 始终保留，页面面包屑显示类似 `记录 > Draft Beer`，但视觉仍保持 Nomi 自己的安静黑白灰风格。

## 改动

- macOS app 用 `expandedRecordID` 管理放大记录状态，放大后仍停留在 `NavigationSplitView` detail 区域内。
- 移除图片预览 overlay 路径，避免放大后遮住 sidebar。
- 新增 `RecordExpandedPage`，顶部提供 `记录 > 当前记录标题` 面包屑，点击 `记录` 返回列表。
- 放大页复用真实记录图片、标题、时间、状态、标签、描述、营养识别 / 识别状态和备注区域。
- titlebar 的 navigation title 在放大页同步显示 `记录 > 当前记录标题`。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
