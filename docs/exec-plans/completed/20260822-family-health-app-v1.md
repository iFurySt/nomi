# Nomi 家庭健康 App V1 全面改造

## 目标

把现有单用户 body-log skeleton 直接改造成 mobile-first 家庭健康资料 App：多账号和家庭隔离、全局 API 鉴权、FS 原始资料/Agent workspace、Postgres 结构化 projection、SeedX/Codex 异步 ingest/chat、iOS 上传与连续对话，并在 amoylab 和 iOS 模拟器完成端到端验证。

## 范围

- 包含：破坏性重构 server API 和 schema；账号/会话/家庭/成员；资产和 storage provider；持久化 job queue；家庭 workspace；SeedX/Codex ingest/chat；iOS 登录、成员、上传、结果、聊天；amoylab 部署；端到端验证。
- 不包含：兼容旧 API/旧 records schema；macOS 适配；导入 `nomi-codex` 真实资料；饮食专用功能；公开 App Store 上架；通用 SaaS 计费和自助多租户运营。

## 背景

- 相关文档：`docs/product-specs/family-private-beta.md`、`docs/ARCHITECTURE.md`、`docs/SECURITY.md`、`docs/RELIABILITY.md`、`docs/DEPLOYMENT.md`、`docs/IOS_TESTFLIGHT_RELEASE.md`。
- 相关代码路径：`apps/server/`、`apps/ios/`、`infra/amoylab/`；外部 harness 代码位于相邻 `../seedx`。
- 已知约束：mobile 优先；不修改 `nomi-codex`；所有改动、history 和验证证据只落在 `nomi`；可以清空/替换旧 schema，不做兼容；SeedX 继续驱动 Codex；服务端 Codex 使用受控的本机登录态。

## 风险

- 风险：新增路由遗漏鉴权，造成家庭健康数据泄露。
- 缓解方式：认证包在顶层 handler 外，`/v1` 默认拒绝；匿名和机器接口只通过显式 allowlist；测试遍历业务路由验证无 token 均为 `401`。
- 风险：Codex/SeedX 在 server 容器与宿主机看到不同 workspace 路径。
- 缓解方式：amoylab 使用单一 bind-mounted data root，同时配置 container root 与 host root 映射；部署 smoke 校验 cwd 和文件回写。
- 风险：异步任务在 server 重启时丢失或重复执行。
- 缓解方式：任务状态存 Postgres，使用 claim/lease；输出幂等地按 job ID 写入；启动时回收超时任务。
- 风险：Agent 修改越过家庭 workspace 或不同任务并发冲突。
- 缓解方式：每个 household 独立 cwd；第一版单 worker 串行执行；运行前后校验 workspace 路径；Codex 使用 workspace-scoped 指令。
- 风险：把 FS 和 Postgres 变成两个互相冲突的真相源。
- 缓解方式：原始文件和 Agent 产物以 FS 为准；账号、权限、任务状态与 mobile projection 以 PG 为准；projection 保存来源路径和 job ID。
- 风险：使用个人 Codex 登录态支撑产品流量。
- 缓解方式：仅用于受信任家庭 private beta；认证文件只存在服务端 secret 目录；未来扩展前迁移为独立 provider/项目凭据和成本控制。

## 里程碑

1. 产品与架构收口。
2. Server domain + auth。
3. Asset + async Agent。
4. iOS mobile-first flow。
5. 部署与真实验证。
6. 文档、history、release、提交和 completion audit。

## 验证方式

- 命令：`make ci`、`cd apps/server && go test ./...`、原生 iOS simulator build/test。
- API：无 token 的全部 `/v1` 业务路由返回 `401`；双账号家庭隔离；资产跨家庭读取返回 `404`；server 重启后 queued job 继续执行。
- Agent：真实 SeedX daemon connected；ingest job 在指定家庭 workspace 新增原件/AI 沉淀；chat job 返回引用；失败状态可观测。
- 手工检查：iOS 登录、成员切换、图片/PDF上传、处理状态、结果和连续聊天。
- 观测检查：amoylab health、server structured logs、SeedX systemd 状态、Codex auth doctor、任务耗时与错误码。

## 进度记录

- [x] 审计现有 nomi、nomi-codex 模式与 SeedX daemon contract。
- [x] 确认破坏性重构、mobile-first、FS+PG、全局鉴权和单家庭 private beta 方向。
- [x] 完成 server domain/schema/auth。
- [x] 完成 storage/workspace/job/SeedX-Codex ingest/chat。
- [x] 完成 iOS 核心流程。
- [x] 完成 amoylab 部署和 simulator E2E。
- [x] 完成文档、history、release、提交和 plan 归档。

## 决策记录

- 2026-08-22：旧 `/records`、`/ai/extract-image` 和 mock Ask 不保留兼容；新业务 API 统一使用 `/v1`。
- 2026-08-22：`/v1` 在顶层 middleware 默认鉴权，避免逐 handler 添加认证造成未来漏保护。
- 2026-08-22：第一版使用邮箱密码 + opaque server session，避免 mobile 内嵌服务端 secret；后续可以增加 Apple identity provider 而不改变业务授权模型。
- 2026-08-22：FS provider 保存原件和家庭 Agent workspace，PG 保存权限、任务与 App projection；通过 provider 接口为后续 OSS 留出替换点。
- 2026-08-22：SeedX/Codex 使用 household workspace 作为 cwd；同一家庭任务第一版串行，保证文件变更一致性。
- 2026-08-22：当前 Codex 登录态只服务受信任家庭 private beta；扩大范围前必须切换为可运营的独立模型 provider 配置。
- 2026-08-23：SeedX 0.2.1 daemon 的内部 command timeout 固定为 60 秒。Nomi 将归档、index 和 git commit 改为 Go 的确定性步骤，Codex 只做结构化分析；默认 effort 改为 low。真实 ingest 37.8 秒、chat 45.8 秒完成。
- 2026-08-23：bootstrap code 只允许创建全实例第一个家庭；owner 在 iOS 家庭页生成七天过期、一次性的邀请码。
- 2026-08-23：`server-v0.2.1` 已部署 amoylab；线上非健康 smoke 完成 ingest、chat、answer 和 citations 验证，随后测试家庭已清空并保留 root-only 可恢复快照。
- 2026-08-23：本地 iPhone 17 Pro simulator 的 authenticated XCUITest 已验证资料、对话和家庭三页导航。
