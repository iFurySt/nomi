## [2026-05-06 16:38] | Task: Reuse SeedX daemon

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `codex-cli`

### 📥 User Query

> 用户指出 SeedX 自身应该已经具备 daemon 主动建连能力，不希望 Nomi 重复维护 `seedx-daemon`；同时要求 daemon 鉴权支持 API key，并通过 WebSocket 握手 header 传递。

### 🛠 Changes Overview

**Scope:** `apps/server/`, `docs/`, `README.md`

**Key Actions:**

- **[SeedX reuse]**: 移除 Nomi 仓库内重复的 `apps/seedx-daemon` skeleton，改为使用相邻 `../seedx` 的 `seedx daemon connect`。
- **[Daemon endpoint]**: 在 server 增加 `GET /daemon/connect` 标准入口，并保留 `GET /seedx/ws` 作为旧 smoke 兼容路径。
- **[API key auth]**: 增加 `NOMI_SEEDX_API_KEY` / `--seedx-api-key`，SeedX websocket 握手使用 `Authorization: Bearer ...` 认证，不把 key 放入 URL。
- **[Session logs]**: SeedX 长连接在 ping / pong 后保持会话，不因 smoke ping 主动关连；日志收敛到连接、断开和异常节点。
- **[Docs]**: 同步 README、server README、架构、可靠性、安全和质量评分文档，避免继续指向已移除的 Nomi daemon。

### 🧠 Design Intent (Why)

SeedX 已经提供 daemon 主动建连、`/daemon/connect`、backoff 重连、capability hello 和 Bearer API key header。Nomi 不应该复制这层能力；它只需要实现上层控制面入口和鉴权边界，后续 command 调度也应沿 SeedX daemon protocol 迭代。

### 📁 Files Modified

- `apps/server/internal/app/command.go`
- `apps/server/internal/app/handler.go`
- `apps/server/internal/app/seedx.go`
- `apps/server/internal/app/seedx_test.go`
- `apps/server/README.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/exec-plans/completed/2026-05-06-nomi-mvp-skeleton.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/QUALITY_SCORE.md`
