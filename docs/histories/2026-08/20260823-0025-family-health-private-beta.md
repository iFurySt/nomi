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
- `server-v0.2.2` 已部署至生产，线上 smoke 验证 5 位密码被拒绝、6 位密码通过长度校验且空库状态未被改变；iOS `0.1 (5)` 已完成 TestFlight processing，并自动进入 `nomi-iternal-testing` 内部测试组。
- 真实家庭初始化成功后开始外部 TestFlight 收口：新增公开隐私/支持页面，以及只可由运维 CLI 创建的独立 App Review household，避免 Apple 审核账号进入真实家庭并接触后续健康资料。
- `server-v0.2.3` 已部署并验证公开隐私/支持页面，生产真实家庭计数保持不变；补充了可选 Postgres 集成测试来直接证明真实家庭与审核家庭隔离，并版本化 Beta Review 英文说明。
- 经用户确认后创建独立 `Nomi Review Demo` household，随机凭据仅保存在 `0600` 运维文件；向 Apple 提交审核联系人、demo account 和非诊疗说明，建立 `Nomi Family Beta` 外部组并关联 Build 5。Apple API 和 App Store Connect UI 均确认 Beta Review 为 `APPROVED`、外部组包含 1 个 build。
- 使用无真实个人/医疗信息的 synthetic 文本在隔离审核家庭完成生产 ingest → workspace citation → chat 全链路；ingest 和 chat job 均完成且各返回 1 条引用，验证外测账号实际可用而不只是能够登录。
- 生产多账号验收中，owner 生成一次性邀请码、第二个 synthetic 账号加入同一审核家庭，并从双方验证 people/assets/threads 投影一致；member 创建邀请码正确返回 `403`。临时 session 与 synthetic 成员随后精确清理，不触碰真实家庭。
- 经用户确认后为 `Nomi Family Beta` 启用人数上限为 10 的 Public Link；公网直连和 App Store Connect UI 均验证可用。实际链接不写入 git，安装后的真实家庭注册仍需 owner 生成的一次性 Nomi 邀请码。
- 最终 completion audit 按原始目标重跑 server race/vet、iOS simulator build、登录/邀请码 XCUITest、生产 public/protected HTTP 边界和部署运行态检查；`server-v0.2.3` 容器 healthy、SeedX service active。工程侧要求均有当前证据，计划只保留家庭成员真机安装、注册、上传与对话验收这一项。
- 为真实家庭接入既有本地知识库：新增受控、幂等且拒绝覆盖的 `import-legacy-workspace` 运维命令，把 legacy 成员 slug 映射为生产 person UUID，并将 `ai-vault` Markdown 投影为 household-scoped `knowledge_entries` 与 `/v1/knowledge`。
- iOS 资料页开始读取长期知识投影，列表与详情只呈现标题、摘要和有用判断；登录、上传、对话和家庭页删除重复说明与内部路径，Build 号递增到 6。
- `nomi-codex` 保持只读；稳定资料通过无 `--delete` 的 rsync 同步到生产独立 staging，共 670 个文件、约 92 MiB。发布 `server-v0.2.4` 后生成权限 `0600` 的导入前 Postgres dump，dry-run 唯一命中真实家庭，正式导入新增 565 个文件、1 位成员和 81 条 knowledge。
- 导入后验证两位成员均使用 UUID scope，空标题/摘要、legacy slug 目录和未改写引用均为 0；审核家庭仍为 0 条 knowledge。重复运行 importer 得到 `files_added=0`、`people_created=0`、knowledge 总数不增长，线上认证 API 返回 81 条且未认证仍为 `401`。
- iOS `0.1 (6)` 已 archive 并上传 TestFlight，Build 6 同时进入内部与外部测试组；内部状态为 `IN_BETA_TESTING`，外部状态为 `BETA_APPROVED`。真实家庭内容不进入 binary 或审核家庭。
- Build 6 首次读取真实导入知识时暴露 JSON contract 缺陷：legacy result 的 `open_questions` 为 `null`，Swift 必需数组使整次刷新失败并显示系统英文 missing。生产先留存修正前 PG dump，再精确把 81 条 null 规范为 `[]`；随后真实账号 XCUITest 确认登录后出现 knowledge entry、无 alert，且资料/对话/家庭三页可进入。
- 长期修复在 server 持久化前统一规范 Agent 数组，在 iOS 解码层对旧 null/missing 字段容错并输出稳定中文错误；legacy projection 同时隐藏内部路径型摘要、移除列表标题中与日期行重复的日期前缀。iOS build number 递增到 7。

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
