# 稳定性与可运维性

这里定义 Nomi 当前运行质量底线。CI/CD 流程结构和 release 自动化的默认方案，统一写在 `docs/CICD.md`。

## Server

- Go server 必须提供 `GET /health`。
- `GET /health` 返回 server 状态和 Postgres ping 状态。
- 本地启动命令：`cd apps/server && go run ./cmd/nomi-server --addr :8088`。
- 本地测试命令：`cd apps/server && go test ./...`。
- 默认读取 `NOMI_SERVER_ADDR` 和 `NOMI_DATABASE_URL`，命令行 flag 可覆盖。

## 日志

- Server 使用 Zap structured logs。
- 启动时记录监听地址。
- healthcheck 数据库失败记录 warn。
- record / ask 持久化或读取失败记录 error，并向客户端返回稳定错误码。

## Timeout

- HTTP server 设置 `ReadHeaderTimeout` 为 5 秒。
- 优雅退出使用 5 秒 shutdown timeout。

## 当前短板

- 还没有 metrics / traces。
- 还没有 websocket daemon observability。
- 还没有 CI 中的 Postgres 集成测试。
