## [2026-05-07 18:35] | Task: iOS record persistence

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### User Query

> Today 里写了都是假数据，需要通过 iOS 模拟器真实上传验证，并让记录不要在重新打开后消失。

### Changes Overview

**Scope:** `apps/ios/`, `docs/`

**Key Actions:**

- **[Records adapter]**: 新增原生 iOS `RecordsClient`，通过 server `GET /records` 加载 timeline，通过 `POST /records` 保存上传提取结果。
- **[Upload persistence]**: 上传 sheet 返回 `UploadResult`，Today timeline 立即插入本地记录，并异步保存到 server records。
- **[UI copy]**: 首页总览从 `Daily Balance` 收敛为 `Today`，日志标题从 `Today's Log` 收敛为 `Log`，空态改为直接可点的 Add 动作。
- **[Tests]**: UI test 增加 `NOMI_DISABLE_RECORD_SYNC=1`，避免真实 records 历史影响 picker 上传断言，并更新旧空态 / 计数文案。

### Design Intent (Why)

Today 不能只靠 SwiftUI 运行内 state 维持上传结果，否则 app 重启后记录会消失。当前先把 extraction 结构映射为 server record，保证上传后的文本、分类、指标和置信度可恢复；图片二进制资源仍未持久化，后续需要单独接本地缓存或对象存储。

### Files Modified

- `apps/ios/NomiNative/ContentView.swift`
- `apps/ios/NomiNative/RecordsClient.swift`
- `apps/ios/NomiNative.xcodeproj/project.pbxproj`
- `apps/ios/NomiNativeUITests/NomiNativeUploadFlowUITests.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
- `docs/histories/2026-05/20260507-1835-ios-record-persistence.md`
