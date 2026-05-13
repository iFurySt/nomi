# Async image record status

## 用户诉求

图片上传不要同步等待识别完成，也不要做 mock / 兜底营养结果；上传后先成功写入 record，后端异步通过 SeedX/Codex 识别，再更新 record status，记录页按真实 server 数据展示。

## 改动

- Server records 增加 `status` 字段，状态定义为 `pending`、`processing`、`completed`、`failed`。
- `POST /ai/extract-image` 改为先保存图片、创建 `pending` record 并返回 `202 Accepted`，后台任务再调用 SeedX/Codex。
- SeedX 分析成功后更新同一条 record 的标题、摘要、营养 metadata、confidence 和 `completed` 状态；失败时标记 `failed`，不生成兜底营养估算。
- 删除 server 旧的文件名驱动 mock image extraction builder。
- macOS 记录页移除 Figma fixture 拼接，只展示 `GET /records` 的真实数据；默认不选中 record，点击列表行后才打开右侧详情。
- 记录页增加空态、`pending/processing/failed` 状态标签和非完成态的识别状态面板。
- iOS 上传路径删除本地 `ImageExtraction.fallback` 和二次 `POST /records` 兜底保存；上传成功只插入 server 返回的 record/status，上传失败不造假数据。

## 验证

- `cd apps/server && go test ./...`
- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- `xcodebuild -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Debug -destination 'generic/platform=iOS Simulator' build`

## 影响文件

- `apps/server/internal/app/record.go`
- `apps/server/internal/app/store.go`
- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/extraction.go`
- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `apps/macos/Nomi/Sources/Nomi/RecordsClient.swift`
- `apps/ios/Nomi/ContentView.swift`
- `apps/ios/Nomi/RecordsClient.swift`
- `apps/server/README.md`
- `docs/ARCHITECTURE.md`
