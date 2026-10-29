# TestFlight 家庭外部分发

> 2026-10-18 范围更新：Nomi 已定位为个人一站式工作台，并迁入 Electron 桌面基础；本计划仅跟踪原有 iOS 家庭资料 beta 的分发，不约束桌面或全产品范围。

## 目标

让没有 Apple Developer / App Store Connect 权限的家庭成员可以通过 TestFlight 安装 Nomi，同时确保 Apple Beta App Review 使用隔离的演示家庭，不能访问真实家庭健康资料。

## 范围

- 包含：公开隐私/支持页面、隔离审核账号的可重复运维入口、TestFlight 外部测试资料、外部测试组和 Beta App Review 提交。
- 不包含：App Store 正式发布、公开自助注册、真实健康资料迁移。

## 背景

- 相关文档：`docs/SECURITY.md`、`docs/IOS_TESTFLIGHT_RELEASE.md`、`docs/product-specs/family-private-beta.md`。
- 相关代码路径：`apps/server/internal/app/`、`infra/amoylab/`。
- 已知约束：生产已初始化真实家庭；审核账号不得通过家庭邀请加入该家庭；外部测试首次构建必须经过 Apple Beta App Review。

## 风险

- 风险：审核账号误入真实家庭并看到后续健康资料。
- 缓解方式：由仅能在运维环境执行的 server CLI 创建独立 household，不暴露公共创建家庭接口。
- 风险：审核凭据进入 git、日志或 shell history。
- 缓解方式：随机生成并只存入 git ignored 的本机 `.apple/`，提交给 Apple 前进行 action-time 确认。

## 里程碑

1. 补齐外测所需的公开说明和隔离审核账号能力。
2. 部署并验证独立审核家庭。
3. 配置外部测试组、审核信息并提交 Beta App Review。
4. 审核通过后邀请家庭成员并完成安装验证。

## 验证方式

- 命令：`go test -race ./...`、`go vet ./...`、`make ci`。
- 手工检查：隐私/支持 URL 可公开访问；真实家庭和审核家庭 household ID 不同。
- 观测检查：生产 health 正常；审核账号只能看到演示家庭；TestFlight build 状态进入审核/可测试。

## 进度记录

- [x] 确认真实家庭初始化成功，Build 5 已进入内部测试组。
- [x] 完成公开隐私/支持页面和隔离审核账号入口。
- [x] 部署外测 server 能力并验证公开页面。
- [x] 经用户确认后创建隔离审核家庭，并验证真实/审核 household 完全分离。
- [x] 配置 `Nomi Family Beta` 外部组、关联 Build 5 并完成 Beta App Review；Apple 状态为 `APPROVED`。
- [x] 用隔离审核家庭在生产完成合成文本上传、SeedX/Codex ingest 和连续 Chat smoke；两条异步链路均完成并各返回 1 条 workspace citation。
- [x] 在生产用一次性邀请码让第二个 synthetic 账号加入审核家庭；owner/member 看到相同的 2 people、1 asset、1 thread，member 创建邀请码返回 `403`。验收后撤销临时 session 并清理 synthetic 成员账号。
- [x] 经用户确认后为 `Nomi Family Beta` 启用人数上限为 10 的 Public Link；公网直连返回 `200`，App Store Connect UI 显示 `0 of 10`。链接作为分发入口不写入 git。
- [ ] 审核通过并完成家庭成员安装验证。

## 决策记录

- 2026-08-23：不把 Apple 审核账号加入真实家庭；使用运维 CLI 创建独立审核 household，避免审核期间暴露家庭健康资料。
- 2026-08-23：将英文 Beta Description 和 Review Notes 版本化；审核文案明确空白演示家庭、异步处理时延和非诊疗边界。
- 2026-08-23：审核凭据由生产 CLI 随机生成，生产与本机副本均为 `0600`；App Store Connect API 只提交经用户确认的联系人、审核凭据和说明，敏感值不进入 git 或 history。
- 2026-08-23：Build 5 加入 `Nomi Family Beta` 后 Apple API 与 App Store Connect UI 均确认外部组已有 1 个 build，Beta Review 状态直接为 `APPROVED`。
- 2026-08-23：用户确认创建 10 人 Public Link；TestFlight 链接只提供安装资格，真实家庭的账号加入继续由 owner 生成的一次性 Nomi 邀请码控制。

## Completion audit

2026-08-23 按原始 V1 目标重新核验当前源码、测试与生产状态：

| 原始要求 | 权威证据 | 结论 |
| --- | --- | --- |
| mobile-first iOS，不维护 macOS 兼容 | `apps/ios/Nomi` 当前 SwiftUI shell；iPhone 17 Pro Debug build 与登录/邀请码 XCUITest 通过 | 已证明 |
| server CRUD 后异步驱动 SeedX/Codex | Postgres job queue、worker、SeedX controller 与 Codex runner；生产 synthetic ingest/chat 均完成并返回 citation | 已证明 |
| 多用户与默认全局鉴权 | `/v1/*` 顶层 session gate、未知 `/v1/future-route` 单测与生产请求均返回 `401`；synthetic 双账号共享投影、member invite `403` | 已证明 |
| FS 为资料真相源，PG 保存结构化状态，storage 可替换 | household workspace、显式 tenant-scoped Store 查询与 `StorageProvider` 接口；race tests 覆盖 traversal/workspace finalization | 已证明 |
| 部署 amoylab 并使用服务端 Codex 登录态 | `server-v0.2.3` 容器 healthy、`nomi-seedx.service` active；生产 ingest/chat smoke 已完成 | 已证明 |
| 家庭成员可以安装、注册、上传并 chat | Build 5 已获 Beta Review `APPROVED`，10 人 Public Link 可访问；仍缺一台家庭成员真机完成安装、邀请码注册、上传和对话 | 待外部验收 |

本轮重新执行 `go test -race ./...`、`go vet ./...`、iOS simulator build、登录/邀请码 XCUITest、生产 public/protected HTTP 边界与部署运行态检查，均通过。工程侧没有发现新的 V1 阻塞项；在家庭成员真机证据出现前，plan 保持 active，整体目标不提前标记完成。
