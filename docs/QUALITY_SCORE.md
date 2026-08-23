# 质量评分

评分：A=完整稳定；B=可用但有明确短板；C=能跑但需补强；D=脆弱或未定义。

| 区域 | 评分 | 当前证据 | 主要短板 |
| --- | --- | --- | --- |
| 产品 | B | 家庭账号、成员 scope、上传分析和连续对话形成 mobile 闭环；生产 synthetic 双账号验证共享 people/assets/threads 与 owner-only invite；外测 Public Link 已按 10 人上限启用。 | 还没有密码找回、导出/彻底删除；家庭成员真机安装待完成。 |
| 架构 | B | FS 原件/上下文与 PG 权限/队列/projection 边界明确；legacy AI 文档已投影为 household-scoped knowledge，StorageProvider 可替换。 | schema migration 仍是启动式，缺正式迁移工具。 |
| iOS | B | 登录、邀请注册、家庭成员、上传、资料知识列表和 chat 已编译；真实生产账号 authenticated XCUITest 已验证 81 条 legacy knowledge 可加载、无 alert，且资料/对话/家庭三页可进入；`0.1 (7)` 已在内部/外部组可用并获 `BETA_APPROVED`。 | 真实家庭真机资料/对话体验待用户确认；还需要更多异常态自动化。 |
| 后端 | B | `/v1` 默认鉴权、tenant scoped CRUD/knowledge、持久 job queue、幂等 legacy importer、workspace git 和 SeedX/Codex 均已实现。 | 缺速率限制、审计表、retry API 与完整删除语义。 |
| Agent | B | 真实 ingest 37.8 秒、chat 45.8 秒完成，归档/摘要/commit/citations 均有实证。 | SeedX 0.2.1 daemon 的 60 秒硬上限需上游配置化。 |
| 测试 | B | Go 单测、鉴权默认拒绝、storage traversal、workspace finalization、Swift build 与 auth UI test。 | 缺自动 Postgres 集成测试和 CI 中的真实 SeedX smoke。 |
| 部署 | B | `server-v0.2.5` 已部署且 healthy；真实家庭的 565 个 workspace 文件与 81 条 knowledge 经幂等、隔离、JSON contract 和 authenticated UI 验证，修正前另留 PG dump。 | 需要做周期化备份和完整恢复演练。 |
| 安全 | B- | bcrypt、hashed opaque sessions、single household bootstrap、一次性邀请、tenant isolation、Keychain。 | 缺 rate limit、邮箱验证、密码重置、设备会话和彻底删除。 |
| 可观测性 | C | 结构化 job 日志包含 id/kind/household/duration/error。 | 缺 metrics、traces、队列告警和 request id。 |
