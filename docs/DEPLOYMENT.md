# 个人文稿同步服务部署

2026-11-15：当前后端为 `apps/sync-server`，独立 Go / PostgreSQL / disk ObjectStore。已在本机新数据库与隔离容器验证，尚未部署远端。桌面默认不连接；手机和家庭协作不在 v1 范围内。

旧家庭服务的 [amoylab 部署档案](references/legacy-family-deployment.md) 仅供追溯。旧 `server-v*` 自动部署工作流已移除，不得用旧 tag / database / volume 发布新同步服务；后续远端发布需为本服务另定制品和部署目标。本轮未修改旧远端服务或数据。

## 本地私有部署

从仓库根目录执行，使用 Docker Compose。配置见 [compose.yml](../infra/sync/compose.yml)，服务、数据库和两个持久卷独立；数据库不暴露宿主端口，API 仅绑定 loopback。服务器以非 root、只读根文件系统运行，原件卷可写。

准备一个权限 `0600`、仓库外的环境文件，包含：

```dotenv
NOMI_SYNC_DB_PASSWORD=<CSPRNG 生成的十六进制密码>
NOMI_SYNC_PORT=8089
```

密码限用十六进制，避免连接 URL 转义歧义；不要提交文件或输出内容。以下 `$SYNC_ENV` 指向该文件，项目名固定为个人同步，不复用旧家庭项目。

```sh
docker compose --env-file "$SYNC_ENV" -f infra/sync/compose.yml build sync
docker compose --env-file "$SYNC_ENV" -f infra/sync/compose.yml up -d --wait postgres
docker compose --env-file "$SYNC_ENV" -f infra/sync/compose.yml run --rm -T sync migrate
python3 -c 'import getpass; print(getpass.getpass("Private account password: "))' | docker compose --env-file "$SYNC_ENV" -f infra/sync/compose.yml run --rm -T sync create-user --email you@example.com --password-stdin
docker compose --env-file "$SYNC_ENV" -f infra/sync/compose.yml up -d sync
curl --fail http://127.0.0.1:8089/health
```

`serve` 不自动迁移，启动时校验 schema / migration checksum。每次升级先备份，停止同步服务写入，再显式迁移、启动及检查 health / synthetic 往返。容器重建不删除持久卷，日常停机不使用 `down -v`。

远程使用须配置 HTTPS reverse proxy，客户端只对 loopback 放行 HTTP。代理的请求体限制应覆盖 20 MiB 单原件与协议 JSON 预算，超时至少覆盖服务端 60 秒；关闭鉴权响应缓存。后端不信任 forwarded IP，登录限流当前按直接 peer 计算：单代理后的用户共享限额，私有小规模试用可接受，公开运营前需单独设计可信代理与账号级限流。

## 身份与数据

运维 `create-user` 创建私有账号，无公开注册或密码找回 UI。密码 bcrypt；设备会话为 30 天随机 token 的哈希，用户可从设置撤销单设备。桌面凭据由 safeStorage 加密；不开同步无需登录。不要复用 ChatGPT token。

PostgreSQL 保存正文 / DSL / 画布、版本、权限、引用和收据；`objects` 卷只保存鉴权不可变原件。disk 是开发阶段 ObjectStore，不具备云 OSS 的跨故障域冗余；实际数据使用前配置异机加密备份。

## 配对备份

脚本 [backup-sync-server.sh](../scripts/backup-sync-server.sh) 支持原生 CLI 或显式容器 ID；从不猜测生产目标。需要 Python 3.11+、gzip 与匹配 PostgreSQL 主版本的 dump / restore 工具（容器模式使用数据库容器自带工具）。

```sh
export NOMI_SYNC_PG_CONTAINER="$(docker compose --env-file "$SYNC_ENV" -f infra/sync/compose.yml ps -q postgres)"
export NOMI_SYNC_SERVICE_CONTAINER="$(docker compose --env-file "$SYNC_ENV" -f infra/sync/compose.yml ps -q sync)"
./scripts/backup-sync-server.sh /private/backups/nomi-sync-NEW_TIMESTAMP
```

先取得一致性的 `database.dump`，再导出全部 ready 原件并逐个校验摘要；当前原件不可变且物理 GC 关闭，因此并发新增只会多带原件，不会遗漏 dump 引用。只有两份文件完成后才生成 SHA-256 `COMPLETE.json`。没有完成标记的目录不是有效备份；目录已有时脚本拒绝覆盖。

建议每天备份并复制到异机加密存储；备份文件包含私密正文与账号哈希，不上传公开制品。备份调度 / 异机目的地由部署环境配置，本仓库不自动创建定时任务。版本历史保留规则不等于灾备保留策略。

## 隔离恢复与回退

[restore-sync-server.sh](../scripts/restore-sync-server.sh) 要求**新的空数据库和空原件目录**。先检查备份完整标记与两个归档摘要，任何已有表 / 原件都拒绝覆盖；恢复后校验 schema、全部文稿引用和原件哈希。失败时保留隔离目标用于诊断，不自动删除用户数据。

原生恢复设置 `NOMI_SYNC_BINARY`、`NOMI_SYNC_DATABASE_URL`、`NOMI_SYNC_OBJECT_DIR`；Docker 恢复设置目标 `NOMI_SYNC_PG_CONTAINER` 和 `NOMI_SYNC_SERVICE_CONTAINER`。如使用另一个 Compose 项目恢复，先启动新 Postgres，再启动挂载新 objects 卷、继承相同环境的临时维护容器；**不要运行 migrate 或 serve**。例如：

```sh
# 新项目、新端口、新卷；使用独立恢复环境文件。
docker compose --env-file "$RESTORE_ENV" -f infra/sync/compose.yml -p nomi-sync-restore up -d --wait postgres
docker compose --env-file "$RESTORE_ENV" -f infra/sync/compose.yml -p nomi-sync-restore run -d --no-deps --name nomi-sync-recovery --entrypoint sh sync -c 'sleep 86400'
export NOMI_SYNC_PG_CONTAINER="$(docker compose --env-file "$RESTORE_ENV" -f infra/sync/compose.yml -p nomi-sync-restore ps -q postgres)"
export NOMI_SYNC_SERVICE_CONTAINER=nomi-sync-recovery
./scripts/restore-sync-server.sh /private/backups/nomi-sync-COMPLETE_TIMESTAMP
# 验证通过后移除临时维护容器，再启动新项目 sync 进行独立客户端验收。
docker rm -f nomi-sync-recovery
docker compose --env-file "$RESTORE_ENV" -f infra/sync/compose.yml -p nomi-sync-restore up -d sync
```

不提供破坏性 down migration。升级回退使用旧制品和**升级前配对备份**在新目标恢复，验收后显式切换服务地址。恢复的服务保留原 space / entity / receipt 身份；恢复后已有客户端仍需按其基线对账，旧版本竞争保留双方。回退窗口之后的云端写入不会凭空出现在旧备份里，应保留原数据库 / 原件和客户端待同步版本供恢复。

## 维护与观测

- `nomi-sync maintain` 默认 dry-run，`--apply` 执行历史 / 日志清理；服务启动与每 24 小时也执行。保留并集规则见 [设计](design-docs/cloud-sync.md)。物理对象 GC 关闭。
- `nomi-sync verify` 输出原件数、总字节和空间数，逐个校验原件与图；适合恢复后 / 定期离线演练，成本随数据量增加。
- HTTP 日志只记录操作类别、方法、状态码和耗时；按 409 / 401 / 429 / 5xx 汇总冲突 / 会话 / 限流 / 错误，不记录正文、账号、token、路径 ID。客户端设置显示待同步、错误、冲突数与最后成功时间。
- 持续监控 Postgres、对象卷容量、备份完成时间及 health；首版不接 Redis、公开 metrics 或告警平台。历史 30 天高频修改与永久收据 / tombstone 均可能增长，不把最近 50 条误当总量上限。

## 可重复验收

```sh
./scripts/test-sync-server.sh
node scripts/check-sync-package.mjs --backup
node scripts/check-sync-compose.mjs
# macOS，两套独立 Electron profile / 原生资料目录 / 设备会话
node scripts/check-sync-package.mjs --desktop
```

均使用 synthetic 文稿与唯一临时项目，只清理自己创建的容器。产物位于忽略的 `.artifacts`。本机隔离验证不等于两个物理 Mac 或公网生产验收。
