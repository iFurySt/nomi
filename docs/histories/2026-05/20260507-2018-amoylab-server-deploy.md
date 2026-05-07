## [2026-05-07 20:18] | Task: amoylab server deploy

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### 📥 User Query

> 增加 server 部署到 ssh amoylab `/opt/nomi`：远端用 Docker Compose 启动，复用现有 Postgres 并新增 `nomi` database / role；GitHub CI/CD 推 GHCR 镜像后 SSH 到 amoylab 拉取升级并清理旧镜像；SSH key 要限制权限；把后续 server 发版流程记录到 AGENTS 和 docs。

### 🛠 Changes Overview

**Scope:** `apps/server`、`.github/workflows`、`infra/amoylab`、`docs`

**Key Actions:**

- **[Docker image]**: 为 Go server 增加 Dockerfile 和 `.dockerignore`，镜像提供 `/health` healthcheck。
- **[Compose deploy]**: 新增 `infra/amoylab/docker-compose.yml` 和 `env.example`；远端 `/opt/nomi` 使用同构 compose，server 加入 `postgres_default` network 并连接 `postgres:5432`。
- **[GitHub Actions]**: 新增 `server-release.yml`，`server-v*` tag 触发构建并推送 `ghcr.io/ifuryst/nomi-server`，随后用受限 SSH key 部署到 amoylab。
- **[Remote bootstrap]**: 在 amoylab 创建 `nomi` database / role、`/opt/nomi/.env`、`nomi-deploy` 用户、forced command wrapper 和固定 root deploy script。
- **[Docs]**: 更新 AGENTS、README、CICD、安全、架构、质量评分和部署文档，明确后续 server 发版要递增 `server-v*` tag 并观察 GitHub Actions / amoylab health。

### 🧠 Design Intent (Why)

Server 的发布入口需要能被后续 Agent 机械执行和验证，所以把 tag 规则、GHCR 镜像名、远端目录、健康检查和恢复命令写进仓库。远端 deploy key 不给通用 shell / docker 权限，而是通过 forced command 和 sudo 固定脚本只执行 Nomi 部署、健康检查和旧镜像清理。

当前 records / Ask API 尚未认证，因此 amoylab compose 默认只绑定 `127.0.0.1:8088`，避免未认证 API 直接暴露公网。公开访问应等认证、反向代理和 TLS 策略补齐后再调整。

### ✅ Verification

- `make ci`
- `cd apps/server && go test ./...`
- `docker build -t ghcr.io/ifuryst/nomi-server:local-test apps/server`
- `docker run --rm --entrypoint /usr/local/bin/nomi-server ghcr.io/ifuryst/nomi-server:local-test --help`
- GitHub Actions `Server 发布` run `25495176882` for `server-v0.1.1` completed successfully.
- amoylab `nomi-server` is healthy and `/health` returns `{"database":"ok","status":"ok"}`.
- amoylab image labels show `version=server-v0.1.1` and revision `29dc60d7d1c657bc053eb069860bb3e378659808`.
- Restricted deploy key accepts `health` and rejects arbitrary command with status `126`.

### 📁 Files Modified

- `.github/workflows/server-release.yml`
- `apps/server/Dockerfile`
- `apps/server/.dockerignore`
- `apps/server/README.md`
- `infra/amoylab/docker-compose.yml`
- `infra/amoylab/env.example`
- `infra/amoylab/nomi-deploy-root.sh`
- `infra/amoylab/nomi-deploy-ssh.sh`
- `docs/DEPLOYMENT.md`
- `docs/CICD.md`
- `docs/SECURITY.md`
- `docs/ARCHITECTURE.md`
- `docs/QUALITY_SCORE.md`
- `AGENTS.md`
