# macOS hide empty related data

## 用户诉求

记录详情里的相关数据当前没有真实数据来源，体重和睡眠不应该作为占位内容显示。

## 改动

- 移除 macOS 右侧记录详情中的“相关数据”占位区。
- 删除未再使用的 `RelatedDataRow` 组件，避免继续保留假体重 / 睡眠内容。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
