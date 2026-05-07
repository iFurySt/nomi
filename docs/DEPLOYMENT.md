# 部署说明

Nomi server 部署在 `amoylab:/opt/nomi`，通过 Docker Compose 启动，镜像由 GitHub Actions 发布到 GHCR。

## amoylab 运行形态

- 目录：`/opt/nomi`
- Compose 文件：`/opt/nomi/docker-compose.yml`
- 环境文件：`/opt/nomi/.env`
- 服务容器：`nomi-server`
- 镜像：`ghcr.io/ifuryst/nomi-server:latest`
- 端口：默认只绑定 `127.0.0.1:8088`
- 数据库：复用 amoylab 现有 Postgres 容器，单独创建 `nomi` database 和 `nomi` role

当前 records / Ask API 还没有用户认证，所以 amoylab 上的 HTTP 端口默认只对本机开放。需要外部访问时，先补认证和反向代理策略，再调整 Compose 端口绑定。

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

