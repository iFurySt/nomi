# 部署说明

Nomi server 部署在 `amoylab:/opt/nomi`，通过 Docker Compose 启动，镜像由 GitHub Actions 发布到 GHCR。

## amoylab 运行形态

- 目录：`/opt/nomi`
- Compose 文件：`/opt/nomi/docker-compose.yml`
- 环境文件：`/opt/nomi/.env`
- SSH wrapper：`/usr/local/bin/nomi-deploy-ssh`，仓库模板见 `infra/amoylab/nomi-deploy-ssh.sh`
- Root deploy script：`/usr/local/sbin/nomi-deploy-root`，仓库模板见 `infra/amoylab/nomi-deploy-root.sh`
- SeedX systemd unit：`/etc/systemd/system/nomi-seedx.service`，仓库模板见 `infra/amoylab/nomi-seedx.service`
- 服务容器：`nomi-server`
- 镜像：`ghcr.io/ifuryst/nomi-server:latest`
- 容器端口：只绑定 `127.0.0.1:8088`
- 上传图片目录：`NOMI_IMAGE_STORAGE_DIR=/var/lib/nomi/uploads`，Compose 通过 `uploads` 命名卷挂载；镜像 entrypoint 会初始化目录权限后降权为非 root `nomi` 用户运行 server。
- 公网入口：`https://nomi.ifuryst.com`，nginx 配置为 `/etc/nginx/conf.d/nomi.ifuryst.com.conf`，仓库模板见 `infra/amoylab/nginx-nomi.ifuryst.com.conf`
- SeedX 远端图片资产：`NOMI_PUBLIC_BASE_URL=https://nomi.ifuryst.com`，server 会把 `/images/...` 绝对 URL 发给 SeedX daemon，由 SeedX 下载校验后在用户机器本地 materialize。
- SeedX / Codex 宿主机桥接：amoylab 宿主机安装 `seedx` 和 `codex`，Codex 使用 root 用户的 ChatGPT 登录状态；`nomi-seedx.service` 通过 systemd 常驻运行 `seedx daemon connect --server-url http://127.0.0.1:8088 --asset-host https://nomi.ifuryst.com`，读取 `/opt/nomi/.env` 里的 `NOMI_SEEDX_API_KEY`，直接连接容器暴露到宿主机 loopback 的 Nomi server websocket；常驻服务不要加 `--once` 或短 `--timeout`。
- TLS：使用 snap certbot 的 nginx plugin 管理，证书路径是 `/etc/letsencrypt/live/nomi.ifuryst.com/`
- 数据库：复用 amoylab 现有 Postgres 容器，`nomi-server` 加入 `postgres_default` Docker network，并单独创建 `nomi` database 和 `nomi` role

当前 records / Ask API 还没有用户认证。`nomi.ifuryst.com` 已为 iOS 上架前的生产 API 打通 HTTPS，但在接入真实用户前必须补 API 认证、授权和审计；Compose 仍只把容器端口绑定到本机，由 nginx 统一对外暴露。

## 服务清单

| 服务 | 运行位置 | 管理方式 | 当前入口 / 关键配置 | 检查命令 |
| --- | --- | --- | --- | --- |
| Nomi API server | Docker 容器 `nomi-server` | `/opt/nomi/docker-compose.yml` + `/usr/local/sbin/nomi-deploy-root` | `ghcr.io/ifuryst/nomi-server:latest`，宿主机只绑定 `127.0.0.1:8088` | `ssh amoylab 'sudo /usr/local/sbin/nomi-deploy-root health'` |
| SeedX daemon bridge | amoylab 宿主机 root 用户 | `systemd` unit `nomi-seedx.service` | `seedx daemon connect --server-url http://127.0.0.1:8088 --asset-host https://nomi.ifuryst.com` | `ssh amoylab 'systemctl is-active nomi-seedx.service'` |
| Codex CLI | amoylab 宿主机 root 用户 | npm global package + root 用户登录态 | `@openai/codex`，ChatGPT auth 存在 root 的 Codex home | `ssh amoylab 'codex doctor --summary'` |
| nginx / TLS | amoylab 宿主机 | system nginx + certbot | `https://nomi.ifuryst.com` 反代到 `127.0.0.1:8088` | `curl -I http://nomi.ifuryst.com/health` |
| Postgres | amoylab 现有 Postgres 容器 | 现有 `postgres_default` Docker network | `nomi-server` 用 `/opt/nomi/.env` 的 `NOMI_DATABASE_URL` 访问 `nomi` database | `curl -fsS https://nomi.ifuryst.com/health` |
| 上传图片卷 | Docker named volume `uploads` | Docker Compose volume | 容器内 `NOMI_IMAGE_STORAGE_DIR=/var/lib/nomi/uploads` | `curl -I https://nomi.ifuryst.com/images/<yyyy-mm>/<file>` |

远端当前验证过的 CLI 版本：

```sh
ssh amoylab 'seedx version'
ssh amoylab 'codex --version'
```

2026-05-21 验证值为 `seedx 0.2.1`、`codex-cli 0.132.0`。不要把 `/opt/nomi/.env`、Codex auth 文件或任何 API key 写入仓库。

## nginx / TLS

amoylab 上的 nginx 配置路径：

```sh
/etc/nginx/conf.d/nomi.ifuryst.com.conf
```

证书由 certbot 管理：

```sh
certbot certificates -d nomi.ifuryst.com
systemctl list-timers --all | grep -i cert
```

健康检查：

```sh
curl -fsS https://nomi.ifuryst.com/health
curl -I http://nomi.ifuryst.com/health
```

预期 HTTPS 返回 `{"database":"ok","status":"ok"}`，HTTP 返回 301 到 HTTPS。

## SeedX / Codex 宿主机服务

amoylab 的图片识别生产链路不再依赖开发机上的 SeedX 长连接。宿主机上有：

- `seedx 0.2.1+`
- `codex`
- root 用户的 Codex ChatGPT 登录状态
- systemd unit：`/etc/systemd/system/nomi-seedx.service`，仓库模板见 `infra/amoylab/nomi-seedx.service`

服务检查：

```sh
ssh amoylab 'systemctl is-active nomi-seedx.service'
ssh amoylab 'systemctl is-enabled nomi-seedx.service'
ssh amoylab 'journalctl -u nomi-seedx.service --since "10 minutes ago" --no-pager -n 80'
ssh amoylab 'docker logs --since 10m nomi-server 2>&1 | grep -E "seedx daemon connected|image extraction completed" | tail'
```

手动重启：

```sh
ssh amoylab 'systemctl restart nomi-seedx.service'
```

端到端验证方式：向 `https://nomi.ifuryst.com/ai/extract-image` 上传一张非敏感图片，确认返回的 record 后续从 `pending` / `processing` 变为 `completed`，并且 `metadata.schema_version` 为当前 SeedX/Codex schema。服务的 `--asset-host https://nomi.ifuryst.com` 用于允许 SeedX 下载 server 透传的 `/images/...` 远端图片资产。`--timeout` 只适合临时验证，不要放进 systemd 常驻服务，否则服务会周期性退出并依赖 restart 拉起。

## 后续升级操作

### 升级 Nomi server

推荐走 tag release，让 GitHub Actions 构建 GHCR 镜像并触发 amoylab 部署：

```sh
git tag server-vX.Y.Z
git push origin server-vX.Y.Z
```

workflow 成功后检查：

```sh
ssh amoylab 'sudo /usr/local/sbin/nomi-deploy-root health'
ssh amoylab 'docker compose -f /opt/nomi/docker-compose.yml --env-file /opt/nomi/.env ps'
ssh amoylab 'docker inspect nomi-server --format "revision={{index .Config.Labels \"org.opencontainers.image.revision\"}} version={{index .Config.Labels \"org.opencontainers.image.version\"}}"'
```

如果 GHCR 镜像已经可用但 workflow 的远端步骤失败，可以手动恢复：

```sh
ssh amoylab 'sudo /usr/local/sbin/nomi-deploy-root deploy'
```

如需固定某个镜像版本，在 amoylab 上更新 `/opt/nomi/.env` 的 `NOMI_IMAGE`，再执行 `deploy`。恢复完成后必须再跑 health 和一次图片识别 smoke。

### 升级 SeedX / Codex

amoylab 当前通过 npm global package 提供 `seedx` 和 `codex`：

```sh
ssh amoylab 'npm ls -g --depth=0 | grep -E "@ifuryst/seedx|@openai/codex"'
```

升级前先确认当前服务健康：

```sh
ssh amoylab 'systemctl is-active nomi-seedx.service'
ssh amoylab 'seedx version && codex --version'
```

升级命令按对应包发布方式执行，例如：

```sh
ssh amoylab 'npm install -g @ifuryst/seedx@latest @openai/codex@latest'
ssh amoylab 'seedx version && codex --version'
ssh amoylab 'codex doctor --summary'
ssh amoylab 'systemctl restart nomi-seedx.service'
```

升级后检查：

```sh
ssh amoylab 'systemctl is-active nomi-seedx.service'
ssh amoylab 'journalctl -u nomi-seedx.service --since "10 minutes ago" --no-pager -n 80'
ssh amoylab 'docker logs --since 10m nomi-server 2>&1 | grep -E "seedx daemon connected|image extraction completed" | tail'
```

然后用 Nomi macOS app 或 curl 上传一张非敏感图片，确认最新 record 变为 `completed`。

### 修改 SeedX systemd unit

仓库模板是 `infra/amoylab/nomi-seedx.service`。修改后同步到远端：

```sh
scp infra/amoylab/nomi-seedx.service amoylab:/tmp/nomi-seedx.service
ssh amoylab 'sudo install -m 600 /tmp/nomi-seedx.service /etc/systemd/system/nomi-seedx.service && sudo systemctl daemon-reload && sudo systemctl restart nomi-seedx.service'
```

同步后确认远端和仓库一致：

```sh
ssh amoylab 'cat /etc/systemd/system/nomi-seedx.service' > /tmp/nomi-seedx.remote.service
diff -u infra/amoylab/nomi-seedx.service /tmp/nomi-seedx.remote.service
```

### 修改 nginx / TLS

仓库模板是 `infra/amoylab/nginx-nomi.ifuryst.com.conf`，远端路径是 `/etc/nginx/conf.d/nomi.ifuryst.com.conf`。修改后先测试再 reload：

```sh
ssh amoylab 'sudo nginx -t && sudo systemctl reload nginx'
curl -I http://nomi.ifuryst.com/health
curl -fsS https://nomi.ifuryst.com/health
```

证书续期状态：

```sh
ssh amoylab 'certbot certificates -d nomi.ifuryst.com'
ssh amoylab 'systemctl list-timers --all | grep -i cert'
```

### 数据和上传卷

Postgres 和上传卷是持久状态，不随 server 镜像升级重建。操作前先确认 compose 使用的 network 和 volume：

```sh
ssh amoylab 'docker compose -f /opt/nomi/docker-compose.yml --env-file /opt/nomi/.env config | sed -n "/networks:/,$p"'
ssh amoylab 'docker volume inspect nomi_uploads'
```

不要在普通 history 或日志里记录真实数据库 URL、数据库密码、SeedX API key、Codex token、真实用户图片路径或图片内容。

## GitHub Secrets

`server-release.yml` 需要以下仓库 secrets：

- `AMOYLAB_SSH_HOST`
- `AMOYLAB_SSH_PORT`
- `AMOYLAB_SSH_USER`
- `AMOYLAB_SSH_KEY`
- `AMOYLAB_SSH_KNOWN_HOSTS`

部署 key 对应 amoylab 上的 `nomi-deploy` 用户，并通过 `authorized_keys` forced command 限定到 `/usr/local/bin/nomi-deploy-ssh`。该入口只允许执行固定的 Nomi 部署和健康检查命令，不允许任意 shell。

## 发版流程

后续用户提到发版 server 时，默认流程是：

1. 更新 server 相关代码和文档。
2. 提交并推送到 `main`。
3. 打递增 tag，例如 `server-v0.1.1`，再 `git push origin server-v0.1.1`。
4. 观察 GitHub Actions 的 `Server 发布` workflow。
5. workflow 成功后 SSH 到 amoylab 检查：

```sh
ssh amoylab 'sudo /usr/local/sbin/nomi-deploy-root health'
ssh amoylab 'docker compose -f /opt/nomi/docker-compose.yml --env-file /opt/nomi/.env ps'
```

部署脚本会在拉取并升级 `nomi-server` 后执行带 label 过滤的旧镜像清理，避免 GHCR 旧 server 镜像长期占用磁盘。

## 手动恢复

如果 GitHub Actions 部署失败，但镜像已经推到 GHCR，可以在 amoylab 上用 root 执行：

```sh
sudo /usr/local/sbin/nomi-deploy-root deploy
sudo /usr/local/sbin/nomi-deploy-root health
```

如果需要回滚，先把 `/opt/nomi/.env` 里的 `NOMI_IMAGE` 改成上一版 `server-v*` 镜像标签，再执行同样的 `deploy` 和 `health`。
