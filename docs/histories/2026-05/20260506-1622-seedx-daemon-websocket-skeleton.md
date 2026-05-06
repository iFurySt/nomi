## [2026-05-06 16:22] | Task: SeedX daemon websocket skeleton

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI, local Go processes`

### 📥 User Query

> SeedX 后续跑在当前设备上，daemon 启动后主动连接服务端 websocket 地址并通信；事件协议按 SeedX 方向保持薄封装。每个 milestone 需要自行验证后提交。

### 🛠 Changes Overview

**Scope:** `apps/server/`, `apps/seedx-daemon/`, `docs/`

**Key Actions:**

- **[Server websocket]**: 在 Go server 增加 `GET /seedx/ws`，支持 daemon websocket 连接。
- **[Event envelope]**: 定义 `SeedXEvent` JSON envelope，包含 `id`、`type`、`created_at`、`payload`。
- **[Daemon]**: 新增 `apps/seedx-daemon/` Go module，使用 Cobra、Zap 和 Gorilla websocket，启动后主动连接 server。
- **[Mock exchange]**: Daemon 发送 `daemon.ready`，server 发送 `seedx.request`，daemon 返回 `seedx.response`。
- **[Verification]**: 分别运行 server / daemon `go test ./...`，启动 server 后运行 daemon `--once`，两边日志确认 connected、event received、event sent。

### 🧠 Design Intent (Why)

先固定 server 和本机 daemon 的连接方向、事件 envelope 和日志证据，后续真实 SeedX payload 可以放入 `payload` 透明传递，不需要重写 websocket 基础设施。

### 📁 Files Modified

- `apps/server/internal/app/seedx.go`
- `apps/server/internal/app/seedx_test.go`
- `apps/server/internal/app/handler.go`
- `apps/server/README.md`
- `apps/seedx-daemon/cmd/nomi-seedx-daemon/main.go`
- `apps/seedx-daemon/internal/app/command.go`
- `apps/seedx-daemon/internal/app/seedx.go`
- `apps/seedx-daemon/internal/app/seedx_test.go`
- `apps/seedx-daemon/README.md`
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/QUALITY_SCORE.md`
