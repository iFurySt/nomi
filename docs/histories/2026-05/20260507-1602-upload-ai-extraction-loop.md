## [2026-05-07 16:02] | Task: upload AI extraction loop

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI / zsh`

### User Query

> 继续打通上传图片后的 AI 提取链路，验证 Files / Photos 两类图片来源，并按 input / output 体系返回食物、饮品、咖啡因、运动、信息等输入类别和能量、睡眠、恢复、专注、健康等输出影响，同时保留 kcal、protein、fat、micronutrients、water 等 metadata。

追加校正：用户明确要求闭环必须通过 iOS Simulator 的真实系统上传路径验证，而不是 simulator-only harness；同时 Today 不能再用假数据，应该从真实上传记录生成总览和 timeline。

### Changes Overview

**Scope:** `apps/server`、`apps/mobile`、`apps/ios`、`docs`

**Key Actions:**

- **[Server extraction boundary]**: 新增 `POST /ai/extract-image`，返回 versioned extraction schema，覆盖 input category、output impacts、confidence 和 nutrition / activity metadata，并补齐 food、beverage、caffeine、alcohol、nicotine、information、exercise、sunlight、social 九类 input。
- **[Upload adapter]**: Expo upload domain 会尽力从本地 URI 读取 image base64 payload，并优先调用 server extraction endpoint，失败时使用本地 deterministic fallback；review UI 展示 AI metadata，并用 extraction 结果生成保存 record。
- **[Native upload adapter]**: 原生 SwiftUI Upload Sheet 在 Photos / Files 图片选择后保留 image data 和 MIME type，上传时调用同一 server extraction endpoint，并用返回结果插入 timeline。
- **[Native real-data Today]**: Today 初始状态不再注入假 timeline；总览里的摄入能量、蛋白质、训练、步行、久坐、睡眠等指标从真实 timeline items 派生，空状态明确提示还没有真实上传。
- **[Native upload UI tests]**: 新增 `NomiNativeUITests` target 和共享 scheme，覆盖底栏 Add、上传 sheet、真实 PhotosPicker、真实 fileImporter、Upload 提交和 Today timeline 插入。
- **[Native E2E harness]**: 增加 simulator-only `NOMI_E2E_AUTO_UPLOADS`，可从 app Documents 读取 manifest 和图片，跑完整 app runtime AI path，并把结果写入 `nomi-e2e-results.log`。
- **[Files / Photos parity]**: Files 来源的普通图片不再因为 `source=file` 自动归为 information；分类优先看图片语义，receipt / screenshot / doc 等文件名才进入 information input。
- **[Verification]**: 用四张本地 JPG / HEIC 图片分别模拟 Photos 和 Files 请求，确认 server endpoint 和原生 app runtime 都返回 `2026-05-07.inputs-outputs.v1` schema，且普通图片归为 food input；随后通过 iOS Simulator 真实系统 PhotosPicker / fileImporter 跑 UI test，确认上传后 Today 出现真实 `Food input` timeline item。
- **[Docs sync]**: 更新 architecture、frontend 和 quality docs，记录 image extraction contract、mobile adapter 和验证入口。

### Design Intent (Why)

上传链路需要先稳定 contract，而不是把 AI 结果散落在 UI 字段里。服务端 schema 把 input、output、confidence 和 metadata 明确拆开，前端只消费同一份 extraction 对象；这样后续替换真实模型 adapter 时不需要重写 review UI 或 record 保存路径。Files / Photos 都可能传入普通照片，所以来源只能作为上下文，不能作为强分类规则。

### Verification

- `cd apps/server && go test ./...`
- `cd apps/mobile && npm run typecheck`
- `cd apps/mobile && npm run smoke`
- `xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme NomiNative -configuration Debug -destination 'generic/platform=iOS Simulator' build`
- `POST /ai/extract-image` local smoke with:
  - `IMG_7605.JPG` as Photos / library
  - `IMG_7613.HEIC` as Photos / library
  - `IMG_7624.HEIC` as Files / file
  - `IMG_7753.JPG` as Files / file
- Native iOS simulator `NOMI_E2E_AUTO_UPLOADS=1` smoke with the same four files; `nomi-e2e-results.log` showed all four as `ok`, schema `2026-05-07.inputs-outputs.v1`, category `food`, title `Food input`, confidence `72`.
- `xcodebuild test -project apps/ios/NomiNative.xcodeproj -scheme NomiNative -configuration Debug -destination 'platform=iOS Simulator,id=8239FF81-AFE7-4453-9263-F4D9A5BC63E9' -only-testing:NomiNativeUITests/NomiNativeUploadFlowUITests/testPhotosUploadCreatesRealTimelineEntry`
- `xcodebuild test -project apps/ios/NomiNative.xcodeproj -scheme NomiNative -configuration Debug -destination 'platform=iOS Simulator,id=8239FF81-AFE7-4453-9263-F4D9A5BC63E9' -only-testing:NomiNativeUITests/NomiNativeUploadFlowUITests/testFilesUploadCreatesRealTimelineEntry`
- Server log showed real UI uploads reaching `POST /ai/extract-image` as `Photo library image` / `source=library` and `IMG_7624.HEIC` / `source=file`.
- Screenshot evidence:
  - `docs/generated/verification/nomi-native-real-upload-empty-2026-05-07.png`
  - `docs/generated/verification/nomi-native-real-upload-files-2026-05-07.png`

### Files Modified

- `apps/server/internal/app/extraction.go`
- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/handler_test.go`
- `apps/ios/NomiNative/ContentView.swift`
- `apps/ios/NomiNative/Info.plist`
- `apps/ios/NomiNative.xcodeproj/project.pbxproj`
- `apps/ios/NomiNative.xcodeproj/xcshareddata/xcschemes/NomiNative.xcscheme`
- `apps/ios/NomiNativeUITests/NomiNativeUploadFlowUITests.swift`
- `apps/mobile/App.tsx`
- `apps/mobile/src/domain/upload.ts`
- `apps/mobile/src/domain/domainSmoke.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
