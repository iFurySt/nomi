# macOS record toolbar back

## 用户诉求

记录内页暂时不要面包屑；进入内页后只需要在 toolbar 增加一个返回 icon，参考 Landmarks 的返回控制。

## 改动

- 移除记录放大页内容顶部的自定义面包屑。
- 进入记录放大页时，在 macOS toolbar 左侧显示 `chevron.left` 返回按钮。
- 点击返回按钮会清空 `expandedRecordID`，回到记录列表。
- 同步更新架构文档中 macOS 记录放大页导航描述。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/ARCHITECTURE.md`
