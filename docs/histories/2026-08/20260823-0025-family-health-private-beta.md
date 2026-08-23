## [2026-08-23 00:25] | Task: 将 Nomi 重构为家庭健康 private beta

### 🤖 Execution Context

- **Agent ID**: `Codex /root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop workspace`

### 📥 User Query

> 已验证本地健康知识库模式能由 Codex 跑通，希望继续把 Nomi 包成家人也能使用的 mobile App；允许直接重构旧实现，并要求以家庭、多账号、全局鉴权、FS + Postgres、SeedX/Codex 异步处理和 amoylab 部署为目标推进。

### 🛠 Changes Overview

**Scope:** iOS、Go server、Postgres schema、Agent workspace、SeedX bridge、amoylab infra 与仓库文档。

**Key Actions:**

- 用 user/household/membership/session/invite/person/asset/job/thread/message 领域替换旧单用户 records contract；所有 `/v1` 路由默认鉴权并按 household 隔离。
- 引入 FS StorageProvider、每家庭 git workspace 和持久 Postgres job queue；Go 确定性归档，SeedX/Codex 生成结构化分析与带引用回答。
- 重做 iOS 为登录/邀请、资料、对话、家庭三页 mobile flow，session 存 Keychain，支持照片、PDF、文件上传。
- 更新生产 data bind、配置和 systemd 边界，并同步架构、安全、稳定性、前端、部署、质量与发布文档。
- 使用非健康测试图片完成真实 SeedX/Codex ingest 与 chat smoke；未把测试账号、token、密钥或原始运行日志写入仓库。
- 部署 `server-v0.2.0` 后更新了失效的服务器 Codex auth，并将 Codex CLI 固定到已验证版本；线上 smoke 进一步促成 chat citations 的确定性 workspace index 兜底。
- `server-v0.2.1` 线上 smoke 验证通过并清理临时家庭；iPhone 17 Pro simulator 的 authenticated XCUITest 验证了资料、对话和家庭三页。
- iOS `0.1 (4)` Release archive 已完成；Xcode Apple ID 会话过期后改用仓库本机 `.apple/` 中的 Admin App Store Connect API key 完成 Cloud Signing 和 TestFlight 上传，Build 4 processing 完成并进入现有内部测试组。密钥值未进入 git。
- 收口核验发现 SeedX machine key 会出现在宿主机进程参数中；已立即轮换线上 key 并重建 server、重启 daemon，随后重新验证 HTTPS health、container health 与 daemon connection。后续排障不得直接输出完整进程参数。
- 首次真实注册发现 Debug App 默认仍指向本机 `127.0.0.1`；已统一改为生产 API，只有 local/UI test 显式覆盖，并让 UI test 结束时 terminate App，避免测试环境残留误导手动调试。截图中出现的 bootstrap code 随后轮换。
- private beta 注册密码下限按家庭使用体验从 10 位调整为 6 位；server、iOS 表单、边界测试和安全文档保持一致。

### 🧠 Design Intent (Why)

Nomi 的核心价值不是把旧 body-log UI 分享出去，而是把已经验证的 Agent-first 健康资料工作流封装为家人可安全进入的产品。FS 保留长期可读、可版本化的资料上下文；Postgres 承担身份、授权、队列和移动端投影；iOS 只暴露家庭需要的低摩擦录入、结果和连续对话。

### 📁 Files Modified

- `apps/server/internal/app/`
- `apps/ios/Nomi/`
- `infra/amoylab/`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
- `docs/FRONTEND.md`
- `docs/DEPLOYMENT.md`
- `docs/product-specs/family-private-beta.md`
