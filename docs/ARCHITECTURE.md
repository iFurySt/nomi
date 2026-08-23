# 架构总览

Nomi 是 mobile-first 的家庭健康资料系统。iOS 负责低摩擦录入和对话；Go server 负责认证授权、家庭领域、资产、持久队列和 mobile projection；SeedX/Codex 在家庭隔离的 filesystem workspace 中读取资料并生成可追溯分析。

旧的单用户 `/records`、`/ask`、`/ai/extract-image` contract 和 macOS 客户端不属于当前 V1，不做兼容。

## 代码结构

- `apps/ios/`：原生 SwiftUI iPhone App。
- `apps/server/`：Go API、Postgres store、FS storage、workspace 和异步 worker。
- `infra/amoylab/`：生产 Compose、nginx、SeedX systemd 和受限部署脚本。
- `docs/product-specs/family-private-beta.md`：当前产品范围。

## 运行拓扑

1. iOS 通过 HTTPS 登录并持有 Keychain 中的 opaque session token。
2. 所有 `/v1/*` 请求先经过顶层会话认证，再按 session 中的 `household_id` 隔离查询。
3. 上传文件写入 `StorageProvider`；当前实现为本地 FS，接口允许未来替换 S3 兼容 OSS。
4. Postgres 保存 user、household、membership、session、invite、person、asset、job、thread 和 message。
5. 单 worker 从 Postgres 以 `FOR UPDATE SKIP LOCKED` claim job，保证重启可恢复。
6. 每个 household 拥有独立 workspace。Go 确定性地归档原件、写入 `ai-vault` 摘要并提交 git；Codex 只读取目标资料和紧凑既有上下文，返回结构化分析。
7. amoylab 宿主机的 `seedx daemon connect` 主动连接 `/daemon/connect`，使用宿主机 Codex 登录态执行 household cwd 中的任务。
8. 对话 job 读取 thread 历史和 workspace，生成带相对路径 citations 的 assistant message。

## 真相源边界

| 数据 | 真相源 | 说明 |
| --- | --- | --- |
| 原始资料、长期摘要、分析文档 | household filesystem workspace | 版本化、可审计、可由 Agent 读取 |
| 原始上传对象 | StorageProvider | 当前 FS；与 workspace 归档副本分离 |
| 身份、权限、队列、会话、App 列表投影 | Postgres | 每个查询必须带 household scope |
| 对话展示 | Postgres messages | assistant message 保留 workspace citations |

workspace 基本结构：

```text
workspaces/<household-id>/
  AGENTS.md
  docs/
  raw-data/
    _incoming/       # 临时、git ignored
    family/
    people/<person-id>/
  ai-vault/
    family/
    people/<person-id>/
  .git/
```

## API 边界

- Public：`GET /health`、`GET /privacy`、`GET /support`、`POST /auth/register`、`POST /auth/login`。
- Machine：`GET /daemon/connect`、带 HMAC 的 `GET /agent/assets/{id}`。
- User protected：全部 `/v1/*`，包含 logout、invite、people、assets、jobs、threads 和 messages。
- 新增任何 `/v1` 路由时，即使忘记单独挂 middleware，也会先被顶层认证包拦截。

## 当前约束

- private beta 只允许创建一个 bootstrap household；owner 后续发一次性邀请。
- Apple Beta App Review 使用运维 CLI 创建的独立演示 household，不加入也不能读取真实家庭。
- 第一版单 worker 串行执行，避免 workspace 冲突。
- SeedX 0.2.1 daemon 对单次命令有 60 秒内部上限；生产默认 Codex effort 为 `low`，Nomi 把确定性文件操作移出 Agent 临界区。扩大使用前应由 SeedX 暴露独立 command timeout。
- 当前 Codex 登录态只允许服务受信任家庭，不作为公开 SaaS 凭据模型。
