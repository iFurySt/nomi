# 稳定性与可运维性

这里定义 Nomi 当前运行质量底线。CI/CD 流程结构和 release 自动化的默认方案，统一写在 `docs/CICD.md`。

## Server

- Go server 必须提供 `GET /health`。
- `GET /health` 返回 server 状态和 Postgres ping 状态。
- 本地启动命令：`cd apps/server && go run ./cmd/nomi-server --addr :8088`。
- 本地测试命令：`cd apps/server && go test ./...`。
- 默认读取 `NOMI_SERVER_ADDR` 和 `NOMI_DATABASE_URL`，命令行 flag 可覆盖。
- Websocket endpoint：`GET /seedx/ws`。

## SeedX Daemon

- Daemon 必须主动连接 server websocket URL，默认 `ws://localhost:8088/seedx/ws`。
- 本地启动命令：`cd apps/seedx-daemon && go run ./cmd/nomi-seedx-daemon --server-url ws://localhost:8088/seedx/ws --once`。
- 本地测试命令：`cd apps/seedx-daemon && go test ./...`。
- 长运行模式失败后 2 秒重连；`--once` 用于 smoke 和 CI 风格验证。

## 日志

- Server 使用 Zap structured logs。
- Daemon 使用 Zap structured logs。
- 启动时记录监听地址。
- healthcheck 数据库失败记录 warn。
- record / ask 持久化或读取失败记录 error，并向客户端返回稳定错误码。
- Websocket smoke 必须能看到 daemon connected、event received、event sent。

## Timeout

- HTTP server 设置 `ReadHeaderTimeout` 为 5 秒。
- 优雅退出使用 5 秒 shutdown timeout。

## 当前短板

- 还没有 metrics / traces。
- 还没有 metrics / traces 中的 websocket 指标。
- 还没有 CI 中的 Postgres 集成测试。
