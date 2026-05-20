## [2026-05-20 21:21] | Task: Server SeedX remote image assets

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### 📥 User Query

> SeedX 已支持 daemon 远端图片资产后，更新 Nomi server，发版部署到 amoylab，并用本地样例图片验证完整流程。

### 🛠 Changes Overview

**Scope:** `apps/server/`, `infra/amoylab/`, `docs/`

**Key Actions:**

- **[Remote image asset input]**: server 在配置 `NOMI_PUBLIC_BASE_URL` 后向 SeedX daemon 发送 `{ "type": "image", "url": "https://.../images/..." }`，不再把 server 容器本地 path 当作远端 SeedX 可读路径。
- **[Asset metadata]**: server 基于实际分析文件计算 `sizeBytes` 和 `sha256`，让 SeedX 0.2.1 下载后可校验。
- **[Local fallback]**: 未配置 public base URL 的同机本地开发继续发送 `localImage.path`，避免打断已有本地调试流程。
- **[Deploy config]**: amoylab Compose 和 env 示例增加 `NOMI_PUBLIC_BASE_URL=https://nomi.ifuryst.com`。
- **[Writable uploads]**: server 镜像预建 `/var/lib/nomi/uploads`，entrypoint 初始化实际挂载目录权限后降权为非 root `nomi` 用户运行，amoylab Compose 通过命名卷持久化该目录。

### 🧠 Design Intent (Why)

amoylab 上的 Nomi server 和用户机器上的 SeedX daemon 不共享文件系统。长期方案应让 server 提供可下载 HTTPS 图片资产，由 SeedX 在本机 materialize 后交给 Codex，而不是透传 server 容器内路径。

### 📁 Files Modified

- `apps/server/internal/app/image_analysis.go`
- `apps/server/internal/app/seedx.go`
- `apps/server/internal/app/command.go`
- `apps/server/internal/app/handler_test.go`
- `apps/server/Dockerfile`
- `apps/server/docker-entrypoint.sh`
- `apps/server/README.md`
- `infra/amoylab/docker-compose.yml`
- `infra/amoylab/env.example`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/QUALITY_SCORE.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/releases/feature-release-notes.md`

### ✅ Verification

- `cd apps/server && go test ./...`
- `make check-docs`
- `docker compose --env-file infra/amoylab/env.example -f infra/amoylab/docker-compose.yml config >/dev/null`
- `git diff --check`
- `server-v0.1.5` GitHub Actions server release completed successfully and deployed to amoylab.
- `ssh amoylab 'sudo /usr/local/sbin/nomi-deploy-root health'` returned `{"database":"ok","status":"ok"}`.
- amoylab `nomi-server` container reported `NOMI_PUBLIC_BASE_URL=https://nomi.ifuryst.com`, `NOMI_IMAGE_STORAGE_DIR=/var/lib/nomi/uploads`, and writable upload storage.
- `POST https://nomi.ifuryst.com/ai/extract-image` with `/Users/bytedance/Downloads/IMG_7753.JPG` returned `202 Accepted`; record `f1d007b4-1936-4026-85df-69bc27cb8605` completed with title `一碗拌面配虾和青菜`.
- `HEAD https://nomi.ifuryst.com/images/2026-05/20260520T134155.198542229-b362d5d6-IMG_7753.jpg` returned `200 OK`, `Content-Type: image/jpeg`, `Content-Length: 431562`.

### ⚠️ Notes

- Local `docker build -f apps/server/Dockerfile apps/server` was attempted, but `go mod download` timed out against `proxy.golang.org`; GitHub Actions built and deployed the same Dockerfile successfully.
