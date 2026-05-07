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
- **[Upload sheet copy]**: 上传 sheet 去掉解释性副标题和长状态文案，主标题改为 `Add`，主按钮空态改为 `Choose`，预览区只保留 `Tap to choose`。
- **[Tests]**: UI test 增加 `NOMI_DISABLE_RECORD_SYNC=1`，避免真实 records 历史影响 picker 上传断言，并更新旧空态 / 计数文案。
- **[Verification]**: 在 iPhone 17 Pro simulator 安装 Nomi，用 `NOMI_E2E_AUTO_UPLOADS=1` 上传 `IMG_7605.JPG`，确认 server `/records` 新增 `Food input`；无环境变量重启 app 后截图确认 Today 从 server 恢复两条记录。
- **[Design reference]**: 在 `docs/UIUX_REFERENCE.md` 增补 Apple HIG Sheets / Modality 官方入口，并记录 Nomi 当前 sheet / panel / card / tile 圆角分层。

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
- `docs/UIUX_REFERENCE.md`
- `docs/generated/verification/nomi-native-record-reload-2026-05-07.png`
- `docs/generated/verification/nomi-native-upload-sheet-refined-2026-05-07.png`
- `docs/histories/2026-05/20260507-1835-ios-record-persistence.md`

### Verification

- `make check-docs`
- `cd apps/server && go test ./...`
- `xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=8239FF81-AFE7-4453-9263-F4D9A5BC63E9' build`
- Simulator upload smoke: `NOMI_E2E_UPLOAD_RESULT ok file IMG_7605.JPG 2026-05-07.inputs-outputs.v1 food Food input 72`
- Server record check: `GET /records` returned the new `Food input` record with `image_uri: IMG_7605.JPG`, `calories_kcal: 540`, `protein_g: 28`.
- Reload screenshot: `docs/generated/verification/nomi-native-record-reload-2026-05-07.png`
- Upload sheet screenshot after copy / radius refinement: `docs/generated/verification/nomi-native-upload-sheet-refined-2026-05-07.png`
