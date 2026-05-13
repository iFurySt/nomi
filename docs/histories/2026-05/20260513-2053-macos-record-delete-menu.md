# macOS record delete menu

## 用户诉求

记录里的三个点需要做成可用菜单，点开后可以删除记录。任务要求小步提交，并保持整体 UI 家族设计语言。

## 改动

- Server 增加 `DELETE /records/{id}`，从 Postgres records 表删除指定记录。
- macOS records API client 增加删除请求。
- macOS 记录页和概览最近记录的三点按钮改为菜单，包含带 `trash` 图标的删除项。
- 删除成功后本地列表立即移除对应记录，并清理右侧选中态 / 图片预览态。
- 同步更新 server README、架构文档和质量分层。

## 验证

- `cd apps/server && go test ./...`
- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/store.go`
- `apps/server/internal/app/handler_test.go`
- `apps/server/README.md`
- `apps/macos/Nomi/Sources/Nomi/RecordsClient.swift`
- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/ARCHITECTURE.md`
- `docs/QUALITY_SCORE.md`
