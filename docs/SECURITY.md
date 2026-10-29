# 安全默认约束

Nomi 处理个人学习、笔记、信息、知识、健康和财富等资料，并可扩展到家庭成员；真实个人及家庭资料默认按敏感数据对待。现有 server beta 的 household 全共享规则不能直接成为未来个人私有空间的默认授权。

## 桌面与本地 AI

- Electron 启用 contextIsolation、sandbox，关闭 nodeIntegration；仅 top-frame allowlist 能访问 host。renderer 不接收 OAuth token、密钥或任意文件 / 进程能力。
- 剪贴板仅允许受信任主文档的 `clipboard-sanitized-write`，供用户点击复制表格 / 代码；开发入口与打包文件按完整 URL 校验，子 frame、剪贴板读取及其他浏览器权限仍拒绝。
- Nomi 使用独立 profile、本地数据目录、OAuth host ID 与注册，不复制 AIFi 登录态或数据。
- ChatGPT 注册 / 会话加密存于本地，文件密钥与密文同目录；目录 0700、文件 0600。同用户文件读取能力仍可解密，不能宣称具有系统 Keychain 等效隔离。
- 保留 PKCE / state / nonce、回调和 JWT 验证、刷新 / 撤销与显式工具审批。Codex 固定版本，运行在专属 cwd 中。
- 当前本地 MCP 为金融研究及虚拟 Arena 服务；不得把它描述成对笔记、健康、家庭或 server 数据的授权。真实交易不在能力范围内。
- Vite 拒绝 secret / ChatGPT / SQLite 及仓库内 `.apple` / `.harness` / `.nomi` 路径；凭据、数据库、临时 profiles 和 smoke artifacts 均不提交。
- 桌面连接与 server 用户会话 / SeedX 机器凭据独立；后续接入家庭资料前先设计明确的共享授权。

## 画布与附件

- Canvas 文档 IR 严格验证版本、ID、引用、数值与预算；旧 revision 不覆盖已保存的新版本。损坏 / 未来文档只报错，保留原始存储。
- IndexedDB 按本机 profile / document 组织；结构与附件原件同事务提交，原件 SHA-256 / 字节数匹配，已存在的 Asset 不允许换内容。
- 图片只按受支持 raster 文件头识别并解码，SVG / HTML 作为普通附件；Markdown 不执行原始 HTML，不自动抓取外部图片，公式保留受限 KaTeX。
- CSP 仅对 img-src 添加 blob: 用于本机图片预览，object / frame 继续禁用。文件使用明确下载入口，不执行附件代码。
- 当前是本机单文档实现，不把本机 profile 键当作服务端权限；共享、同步、完整导出与彻底删除仍待实现。

## 交互 DSL 实验

- `portable.learning/draft-1` 仅允许已知 JSON 组件、纯计算和 Reset；校验版本、引用、树与预算，不执行任意 JS / HTML，不开放 host effects。
- Math 使用 KaTeX `trust:false`、严格错误与展开限制；生成的组件不能访问网络、文件或凭据。
- 定义与学习进度在 localStorage 按本机 profile 分开组织，不宣称为加密或服务端授权；未来文档、实例与家庭共享需单独设计 scope。
- 错误定义保留当前可用内容，损坏进度阻止自动覆盖；Swift reference interpreter 仅处理受信测试样例，尚未接生产导入。

以下为现有 iOS / server beta 约束。

## 身份与授权

- iOS 不持有服务端共享 secret；用户使用邮箱密码登录，密码要求 6–200 位并以 bcrypt hash 保存。
- session token 使用 CSPRNG 生成，只把 SHA-256 hash 存入 Postgres；客户端原 token 存入 iOS Keychain。
- `/v1/*` 在顶层默认鉴权，handler 从服务端 session 取得 `household_id`，不得信任客户端传入 household ID。
- bootstrap code 只能创建全实例第一个 household，并通过 Postgres advisory lock 防并发重复创建。
- owner 生成的家庭邀请为随机、七天过期、一次性 token；只有 owner 可创建。
- TestFlight 审核账号只能由生产运维 CLI 创建到独立演示 household，不得使用真实家庭邀请码；这个能力不暴露 HTTP 接口。
- SeedX daemon 使用独立 Bearer key；该 key 不等同用户 session。

## 数据隔离与存储

- Store 的 people、assets、jobs、knowledge、threads、messages 查询必须带 household scope；跨家庭对象对外表现为 `404`。
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

## 受控资料迁移

- 旧知识库只可先同步到 `/opt/nomi/data/imports/` 下的独立 staging；同步不使用 `--delete`，不得改写源仓库。
- `import-legacy-workspace` 只作为容器内运维命令使用，必须用精确 household 名称和显式成员映射；它拒绝 symlink 和覆盖内容不同的目标文件。
- 正式导入前必须备份 Postgres，并确认目标 workspace 状态；命令输出只报告计数，不打印健康资料正文。
- 导入后的 App projection 继续按 session household scope 查询，审核家庭不会获得真实家庭条目。

## AI 边界

- Agent 必须区分原始事实、推断和不确定性，并为个人事实提供 workspace 相对路径引用。
- 不诊断、不处方、不调整药量、不替代急救或医生。
- Agent cwd 只指向一个 household workspace；prompt 不携带 session、密码或服务端 secret。
- 当前使用个人 Codex ChatGPT 登录态只适用于受信任家庭 private beta；扩大用户范围前要切换独立 provider、补同意、成本、保留期和审计策略。

## 当前安全债务

- 还没有登录速率限制、密码重置、邮箱验证、会话设备管理和安全事件审计表。
- 还没有完整的家庭资料导出/彻底删除工作流。
- 还没有 KMS/对象存储加密与备份恢复演练。
