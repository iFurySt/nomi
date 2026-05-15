# Chinese-only app and extraction output

## 用户诉求

整体系统先收敛到中文，尤其 SeedX 识别输出暂时不支持英文；app 也要同步支持中文-only 方向。

## 改动

- SeedX/Codex 图片与文档识别 prompt 改为中文，并明确要求 `title`、`summary` 和 metadata 自由文本字段输出简体中文；JSON key 和枚举值继续保留英文 API contract。
- 识别 schema version 更新为 `2026-05-15.seedx-codex-zh.v3`。
- server 生成的营养 / 时长摘要、Ask fallback 文案和 SeedX smoke prompt 改为中文。
- iOS 语言选择移除 English 选项，非中文系统默认简体中文；`en.lproj` fallback 文案也改为中文。
- iOS 记录状态、分类副标题和日期 fallback 改为中文；macOS 记录日期 fallback 改为中文。
- 架构、前端和质量文档同步记录当前暂不支持英文界面的边界。

## 验证

- `cd apps/server && go test ./...`
- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- `xcodebuild -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Debug -destination 'generic/platform=iOS Simulator' build-for-testing`
- 本地 server + SeedX daemon 上传 HEIC 检查报告和 PDF 医疗票据，完成记录标题 / 摘要均为中文，schema version 为 `2026-05-15.seedx-codex-zh.v3`。

## 影响文件

- `apps/server/internal/app/image_analysis.go`
- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/seedx.go`
- `apps/server/internal/app/handler_test.go`
- `apps/ios/Nomi/ContentView.swift`
- `apps/ios/Nomi/RecordsClient.swift`
- `apps/ios/Nomi/en.lproj/Localizable.strings`
- `apps/ios/Nomi/en.lproj/InfoPlist.strings`
- `apps/ios/Nomi/zh-Hans.lproj/Localizable.strings`
- `apps/ios/Nomi/zh-Hant.lproj/Localizable.strings`
- `apps/macos/Nomi/Sources/Nomi/RecordsClient.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
