# document file uploads

## 用户诉求

上传入口不应只支持食物图片，还需要能录入体检、检查、报告、发票、收据等个人健康医疗相关文件。

## 改动

- macOS Add overlay 支持选择或拖拽图片和 PDF，文案从图片识别调整为文件识别。
- server 上传大小上限调整为 32MB decoded payload，并保留原始 HEIC / PDF 文件。
- server 对 HEIC 和 PDF 生成 `-seedx.jpg` 旁路预览，用于 SeedX/Codex localImage 分析和客户端 `/images/...` 预览。
- SeedX/Codex 提取 schema 增加 `document_kind`、`document_date`、`issuer`、`currency`、`total_amount` 等文档字段，并把医疗报告、检查单、发票、收据归为 `information` 输入，不做医疗诊断或指标解读。
- 文档与架构说明同步更新图片 / PDF 上传、预览和文档识别边界。

## 验证

- `cd apps/server && go test ./...`
- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- 本地 `POST /ai/extract-image` 上传 1 个 HEIC 检查报告和 2 个 PDF 票据，均返回 `202 Accepted` 并最终完成识别。
- `/images/...heic` 与 `/images/...pdf` 均返回 JPEG 预览。

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `apps/server/internal/app/image_storage.go`
- `apps/server/internal/app/image_analysis.go`
- `apps/server/internal/app/extraction.go`
- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/handler_test.go`
- `apps/server/README.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
