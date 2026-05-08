## [2026-05-08 12:14] | Task: SeedX Codex image extraction

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### 📥 User Query

> 用户指出当前上传图片后只是 server deterministic mock，没有调用 SeedX / Codex；要求改为 server 保存图片、通过 SeedX 调本机 Codex 分析图片、把真实 extraction 写入 server DB，并让 iOS dev 默认连本地、TestFlight / Release 默认连线上域名，改完自行测试。

### 🛠 Changes Overview

**Scope:** `apps/server/`, `apps/ios/`, `docs/`

**Key Actions:**

- **[Server image flow]**: `POST /ai/extract-image` 先把 base64 图片写入 `NOMI_IMAGE_STORAGE_DIR`，再通过 SeedX daemon `daemon:command` 请求本机 Codex，解析 JSON 后写入 `records` 并返回 `record_id`；当前协议使用 SeedX 0.2.0 `method:"run"` + Codex v2 `localImage` input。
- **[SeedX control]**: server 维护当前 daemon session、pending command map 和并发安全 websocket write，支持接收 `daemon:result` 归还给 HTTP 请求。
- **[Prompt contract]**: 新增严格图片分析 prompt，要求使用 SeedX `localImage` 输入、只返回 JSON、限制 input category / output impacts / nutrition metadata，并明确非医疗和敏感文本边界。
- **[iOS API mode]**: Debug 构建默认连 `http://127.0.0.1:8088`，Release / TestFlight 默认连 `https://nomi.ifuryst.com`，仍支持 `NOMI_API_BASE_URL` 覆盖。
- **[Docs sync]**: 更新 architecture、frontend、reliability、security、quality score 和 server README。

### 🧠 Design Intent (Why)

上传图片的真实数据应该由 server 侧持久化和模型分析闭环产生，不能依赖客户端二次保存 mock metadata。当前 SeedX daemon 尚未暴露一等图片 payload，Nomi 采用受控本地文件落盘 + Codex prompt 读取本地路径的方式先跑通真实能力；后续 SeedX command set 支持图片输入后可把 prompt / payload 再收敛。

### ✅ Verification

- `cd apps/server && go test ./...`
- `make check-docs`
- `git diff --check`
- 启动本地 server 和长连接 `seedx daemon connect --server-url http://localhost:8088 --api-key ...` 后，用两张生成图片打 `POST /ai/extract-image`，确认返回 `record_id`、`2026-05-08.seedx-codex-image.v1`、`food` / `information` 两类结果。
- `GET /records` 确认返回的 records 已包含 `analysis_provider=seedx.codex`。
- `xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=8239FF81-AFE7-4453-9263-F4D9A5BC63E9' build`
- iPhone 17 Pro simulator 运行 `NOMI_E2E_AUTO_UPLOADS=1`，结果日志包含 `NOMI_E2E_UPLOAD_RESULT ok file cafe-receipt.png 2026-05-08.seedx-codex-image.v1 information ...`。

### 🔁 Follow-up: SeedX 0.2.0 run/localImage

2026-05-08 继续跟进：SeedX CLI 更新到 `0.2.0` 后，图片输入已支持 Codex v2 `UserInput`，长期入口从 `method:"smoke"` 收敛到 `method:"run"`。Nomi server 因此把图片分析 command 改为：

- `daemon:command` / `method:"run"` / `runtime:"codex"`。
- `params.input[0]` 使用 text prompt。
- `params.input[1]` 使用 `{ "type": "localImage", "path": "<stored upload path>", "name": "<asset name>" }`。
- 暂不发送 `params.outputSchema`：本地验证发现 SeedX 0.2.0 daemon + Codex structured output 会返回空 `text`，而同一张图片用 `localImage` + prompt 可正常返回 JSON。
- `daemon:server_request` 当前统一回 unsupported error，避免 Codex 交互请求让 SeedX run 挂起。

本轮验证：

- `cd apps/server && go test ./...`
- `make check-docs`
- 本地启动 server 和 `seedx daemon connect` 后，用生成的 `cafe-receipt.png` 调 `POST /ai/extract-image`，确认 `method:"run"` + `localImage` 路径可返回 extraction；同时确认 `outputSchema` 仍会导致 SeedX daemon 返回空 `text`。

### 📁 Files Modified

- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/image_storage.go`
- `apps/server/internal/app/image_analysis.go`
- `apps/server/internal/app/seedx.go`
- `apps/server/internal/app/command.go`
- `apps/server/internal/app/extraction.go`
- `apps/server/internal/app/handler_test.go`
- `apps/server/internal/app/seedx_test.go`
- `apps/server/README.md`
- `apps/ios/NomiNative/ContentView.swift`
- `apps/ios/NomiNative/RecordsClient.swift`
- `.gitignore`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/QUALITY_SCORE.md`
