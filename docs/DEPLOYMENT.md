# amoylab 部署

Nomi server 部署在 `amoylab:/opt/nomi`，GitHub Actions 在 `server-v*` tag 时构建 `ghcr.io/ifuryst/nomi-server` 并通过受限 SSH 执行部署。

## 生产拓扑

- Compose：`/opt/nomi/docker-compose.yml`
- Secrets：`/opt/nomi/.env`，权限 root-only
- Data：`/opt/nomi/data` bind 到容器 `/var/lib/nomi`
- API：容器 `8088` 只绑定宿主机 `127.0.0.1:8088`，nginx 提供 `https://nomi.ifuryst.com`
- Postgres：复用 `postgres_default` network 的独立 `nomi` database/role
- SeedX：宿主机 root 的 `nomi-seedx.service`
- Codex：宿主机 root 的 Codex home 与 ChatGPT 登录态

2026-08-23 线上验证版本为 SeedX `0.2.1`、Codex CLI `0.149.0`。Codex 版本固定升级是为了兼容当前模型目录 schema；升级后必须重启 `nomi-seedx.service` 并跑实际 turn，不能只看 `codex login status`。

容器内 workspace 是 `/var/lib/nomi/workspaces/<household>`；发送给宿主机 Codex 的 cwd 是 `/opt/nomi/data/workspaces/<household>`。两者必须指向同一个 bind mount。

## 必需环境变量

以 `infra/amoylab/env.example` 为模板：

- `NOMI_DATABASE_URL`
- `NOMI_SEEDX_API_KEY`
- `NOMI_BOOTSTRAP_INVITE_CODE`
- `NOMI_ASSET_SIGNING_KEY`
- `NOMI_SESSION_DURATION`
- `NOMI_SEEDX_CODEX_REASONING_EFFORT=low`
- `NOMI_SEEDX_COMMAND_TIMEOUT=5m`

生成 secret 时使用 CSPRNG，例如 `openssl rand -base64 32`，但不要把结果留在 shell history、仓库或日志中。bootstrap code 只用于创建第一个家庭；数据库已有 household 后会被服务端拒绝。

## 首次同步配置

```sh
scp infra/amoylab/docker-compose.yml amoylab:/tmp/nomi-compose.yml
scp infra/amoylab/nomi-seedx.service amoylab:/tmp/nomi-seedx.service
ssh amoylab 'sudo install -d -m 700 /opt/nomi/data && sudo install -m 600 /tmp/nomi-compose.yml /opt/nomi/docker-compose.yml && sudo install -m 600 /tmp/nomi-seedx.service /etc/systemd/system/nomi-seedx.service && sudo systemctl daemon-reload'
```

Codex auth 可以从受控开发机复制到 root Codex home，但只能经 SSH 直接传输，复制后检查目录/文件权限为 root-only；不得经过仓库、镜像或普通临时共享目录。

## 发布

```sh
git tag server-vX.Y.Z
git push origin server-vX.Y.Z
```

workflow 成功后：

```sh
ssh amoylab 'sudo /usr/local/sbin/nomi-deploy-root health'
ssh amoylab 'docker compose -f /opt/nomi/docker-compose.yml --env-file /opt/nomi/.env ps'
ssh amoylab 'systemctl is-active nomi-seedx.service'
curl -fsS https://nomi.ifuryst.com/health
```

## Private beta 初始化

1. 用 bootstrap code 在 iOS 注册 owner，创建唯一家庭。
2. owner 在“家庭”页生成一次性家人邀请码。
3. 家人在自己的 iPhone 用该邀请码注册。
4. 上传非敏感测试资料，确认 job 从 queued/processing 到 completed。
5. 提问并确认 assistant answer 带 workspace relative citations。

## 运维与回滚

```sh
ssh amoylab 'journalctl -u nomi-seedx.service --since "10 minutes ago" --no-pager -n 100'
ssh amoylab 'docker logs --since 10m nomi-server'
ssh amoylab 'docker inspect nomi-server --format "revision={{index .Config.Labels \"org.opencontainers.image.revision\"}} version={{index .Config.Labels \"org.opencontainers.image.version\"}}"'
```

回滚时在 `/opt/nomi/.env` 把 `NOMI_IMAGE` 固定到上一 `server-v*`，再运行 `nomi-deploy-root deploy`。代码回滚不会自动回滚 Postgres 或 workspace，执行破坏性迁移前必须单独备份。

备份必须同时覆盖：

- Postgres `nomi` database
- `/opt/nomi/data/assets`
- `/opt/nomi/data/workspaces`

## 已知限制

- SeedX 0.2.1 daemon 内部单命令上限为 60 秒；systemd 的 `--timeout` 是连接生命周期，不是 command timeout，因此常驻 unit 不设置该参数。
- 当前 private beta 使用 root 的个人 Codex 登录态，只允许受信任家庭；扩大用户范围前必须更换凭据与运营模型。
- 不在 deploy/history/log 中记录真实 health 数据、数据库 URL、token 或 Codex auth。
