# 安全默认约束

Nomi 处理真实家庭健康资料，默认按高敏感个人数据对待。

## 身份与授权

- iOS 不持有服务端共享 secret；用户使用邮箱密码登录，密码要求 6–200 位并以 bcrypt hash 保存。
- session token 使用 CSPRNG 生成，只把 SHA-256 hash 存入 Postgres；客户端原 token 存入 iOS Keychain。
- `/v1/*` 在顶层默认鉴权，handler 从服务端 session 取得 `household_id`，不得信任客户端传入 household ID。
- bootstrap code 只能创建全实例第一个 household，并通过 Postgres advisory lock 防并发重复创建。
- owner 生成的家庭邀请为随机、七天过期、一次性 token；只有 owner 可创建。
- TestFlight 审核账号只能由生产运维 CLI 创建到独立演示 household，不得使用真实家庭邀请码；这个能力不暴露 HTTP 接口。
- SeedX daemon 使用独立 Bearer key；该 key 不等同用户 session。

## 数据隔离与存储

- Store 的 people、assets、jobs、threads、messages 查询必须带 household scope；跨家庭对象对外表现为 `404`。
- 每个家庭使用独立 workspace cwd，opaque UUID 作为目录名；路径输入必须阻止 `..`、绝对路径和分隔符穿越。
- 上传默认上限 64 MiB；nginx 与 server 都必须限制请求体。
- 原始对象由 `StorageProvider` 保存；当前 `/opt/nomi/data` 只允许 root 与 Nomi 服务账户访问。
- `raw-data/_incoming` 不进入 git；成功归档后才提交稳定 raw-data 和 ai-vault 文件。
- 删除 asset 当前会删除 Postgres projection 和 provider 对象，但已经进入版本化 workspace 的归档仍需独立的受审计删除流程；这是 private beta 的已知限制。

## 凭据

- 生产的数据库 URL、SeedX key、bootstrap code、asset signing key 只放 `/opt/nomi/.env` 或 secret manager。
- Codex auth 只放 amoylab root 的 Codex home，权限必须为 root-only；不得写入镜像、仓库、日志或 history。
- Apple 签名密钥、profile 与 App Store Connect secret 不写仓库。
- Beta App Review 随机登录凭据只保存到权限 `0600` 的生产运维文件和本机 git ignored `.apple/`，不得进入命令参数、日志、文档或 history。
- 外部分享日志、截图或 workspace 前必须另做脱敏副本。

## AI 边界

- Agent 必须区分原始事实、推断和不确定性，并为个人事实提供 workspace 相对路径引用。
- 不诊断、不处方、不调整药量、不替代急救或医生。
- Agent cwd 只指向一个 household workspace；prompt 不携带 session、密码或服务端 secret。
- 当前使用个人 Codex ChatGPT 登录态只适用于受信任家庭 private beta；扩大用户范围前要切换独立 provider、补同意、成本、保留期和审计策略。

## 当前安全债务

- 还没有登录速率限制、密码重置、邮箱验证、会话设备管理和安全事件审计表。
- 还没有完整的家庭资料导出/彻底删除工作流。
- 还没有 KMS/对象存储加密与备份恢复演练。
