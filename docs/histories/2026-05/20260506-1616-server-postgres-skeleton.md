## [2026-05-06 16:16] | Task: Server Postgres skeleton

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI, local Docker Postgres, Go 1.26`

### 📥 User Query

> Nomi 服务端用 Go，数据库使用 Postgres；每个 milestone 需要自行验证后提交。后续 SeedX daemon 会通过 websocket 主动连接服务端。

### 🛠 Changes Overview

**Scope:** `apps/server/`, `infra/local/`, `docs/`

**Key Actions:**

- **[Go server]**: 新增 `apps/server/` Go module，使用 Cobra 启动命令、Zap structured logs 和 pgxpool。
- **[Postgres]**: 创建本地 `nomi` database，server 启动时初始化 `records` schema 和索引。
- **[HTTP API]**: 实现 `GET /health`、`GET /records`、`POST /records`、`POST /ask`。
- **[AI boundary]**: Ask mock 支持医疗意图阻断，不返回诊断或治疗建议。
- **[Verification]**: 运行 `go test ./...`，启动 `go run ./cmd/nomi-server --addr :8088`，用 curl 验证 health、record create/list 和 Ask 阻断。

### 🧠 Design Intent (Why)

先把 server 和 Postgres 的最小闭环跑通，让后续 mobile API adapter 和 SeedX daemon websocket 可以复用同一个 record schema、日志和 healthcheck 入口。当前 server 只面向本地开发，真实认证和部署边界留到后续 milestone。

### 📁 Files Modified

- `apps/server/cmd/nomi-server/main.go`
- `apps/server/internal/app/command.go`
- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/record.go`
- `apps/server/internal/app/store.go`
- `apps/server/internal/app/handler_test.go`
- `apps/server/README.md`
- `infra/local/README.md`
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/QUALITY_SCORE.md`
