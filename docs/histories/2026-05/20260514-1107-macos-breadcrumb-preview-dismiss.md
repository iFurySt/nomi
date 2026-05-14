# macOS breadcrumb and preview dismiss

## 用户诉求

记录放大页顶部面包屑在系统 titlebar 里显示异常，需要改成稳定的自定义面包屑；记录点开右侧预览框后，点击页面其他地方需要能像 Notion 一样关掉预览。

## 改动

- 移除 macOS toolbar principal 里的自定义面包屑，避免系统 titlebar 布局把面包屑挤坏。
- 在记录放大页内容顶部新增 `RecordBreadcrumbBar`，使用 Nomi 的黑白灰 surface、细边框、小圆角和 `chevron.right` 分隔符。
- 面包屑里的“记录”保持可点击，点击返回记录列表。
- 记录页左侧内容背景增加点击关闭逻辑，右侧预览打开时点击页面其他空白区域会清空当前选中记录并关闭预览框。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
