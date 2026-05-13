# macOS record images and row hit area

## 用户诉求

macOS 记录页里的真实上传记录没有显示图片，列表和预览都只有默认图标；另外记录 / sidebar 行的上下空白点击无效，应该整块都能点击切换。

## 改动

- Server 增加 `GET /images/<yyyy-mm>/<file>`，把本地上传目录里的图片安全暴露给本地客户端预览。
- HEIC 预览请求优先返回已生成的 JPEG sidecar，避免客户端无法直接渲染 HEIC / octet-stream。
- macOS app 将 record 的 `local://images/...` 转换为当前 `NOMI_API_BASE_URL` 下的 `/images/...` URL，并用 `AsyncImage` 在列表、详情和预览里显示真实图片。
- macOS 缩略图组件统一在父容器内裁剪，避免概览最近记录里的异步图片按原图尺寸溢出并堆叠。
- macOS sidebar 行和 record 行增加整块 hit area，空白区域也能触发切换 / 选中。
- 同步更新 server README、架构文档和质量分层。

## 验证

- `cd apps/server && go test ./...`
- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- 本地 server 使用 `/tmp/nomi-uploads` 启动后，`GET /images/...` 能返回上传图片。

## 影响文件

- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/image_storage.go`
- `apps/server/internal/app/handler_test.go`
- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `apps/server/README.md`
- `docs/ARCHITECTURE.md`
- `docs/QUALITY_SCORE.md`
