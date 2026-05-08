# 稳定性与可运维性

这里定义 Nomi 当前运行质量底线。CI/CD 流程结构和 release 自动化的默认方案，统一写在 `docs/CICD.md`。

## Server

- Go server 必须提供 `GET /health`。
- `GET /health` 返回 server 状态和 Postgres ping 状态。
- 本地启动命令：`cd apps/server && go run ./cmd/nomi-server --addr :8088`。
- 本地测试命令：`cd apps/server && go test ./...`。
- 默认读取 `NOMI_SERVER_ADDR`、`NOMI_DATABASE_URL` 和 `NOMI_SEEDX_API_KEY`，命令行 flag 可覆盖。
- 图片上传读取 `NOMI_IMAGE_STORAGE_DIR`、`NOMI_SEEDX_COMMAND_TIMEOUT`、`NOMI_SEEDX_CODEX_MODEL` 和 `NOMI_SEEDX_CODEX_REASONING_EFFORT`；默认把图片落到 `.nomi/uploads`，SeedX/Codex command 超时 2 分钟。
- SeedX websocket endpoint：`GET /daemon/connect`；`GET /seedx/ws` 仅保留为旧 smoke 兼容路径。

## SeedX

- Nomi 不维护独立 daemon，使用本机 `seedx` CLI 的 `seedx daemon connect`。
- 本地启动命令：先启动 Nomi server，再运行 `seedx daemon connect --server-url http://localhost:8088 --api-key dev_seedx_key`。`--once` 只适合验证 hello，不能处理图片分析。
- 图片分析使用 SeedX daemon `daemon:command` / `method:"smoke"`，runtime 为 `codex`，prompt 传入本机图片路径并要求 Codex 只返回 extraction JSON；server 收到 `daemon:result` 后解析并写入 records。
- 如果 Nomi smoke 发现 `seedx` CLI 能力缺口或行为问题，记录在当轮 history / issue 里，用于驱动 SeedX 上游修改。
- SeedX 长运行模式负责断线 backoff 重连；`--once` 用于 hello smoke 和 CI 风格验证。

## 日志

- Server 使用 Zap structured logs。
- 启动时记录监听地址。
- healthcheck 数据库失败记录 warn。
- record / ask 持久化或读取失败记录 error，并向客户端返回稳定错误码。
- Websocket smoke 只在连接、断开和异常等关键节点记录日志；常规 `daemon:hello`、`daemon:ping`、`daemon:pong` 不逐条打 info，日志不得输出 API key。

## Timeout

- HTTP server 设置 `ReadHeaderTimeout` 为 5 秒。
- 优雅退出使用 5 秒 shutdown timeout。

## 当前短板

- 还没有 metrics / traces。
- 还没有 metrics / traces 中的 websocket 指标。
- 还没有 CI 中的 Postgres 集成测试。
