# 架构总览

Nomi / 知己 是一个个人身体与生活记录产品。第一阶段目标是先交付可运行的 MVP skeleton：移动端用 React Native + Expo，后端和 SeedX daemon 用 Go，数据库使用 Postgres。真实 SeedX 接入、云端部署、家庭协作和 Apple Watch 接入在后续阶段处理。

## 当前仓库结构

- `apps/mobile/`：Expo mobile app。当前包含 Home、Timeline、Capture、Trends、Ask、Settings 六个基础界面，以及 mock records / trends 数据。
- `docs/product-specs/`：产品规格和 MVP 验收范围。
- `docs/exec-plans/active/`：当前跨 milestone 执行计划。
- `docs/generated/verification/`：本地验证生成物，例如 UI 截图。
- `docs/`：仓库知识库，也是本地规则和上下文的正式来源。

## 计划中的结构

- `apps/server/`：Go API server，负责 record、ask/mock、daemon websocket endpoint 和 Postgres 访问。
- `apps/seedx-daemon/`：Go daemon，启动后主动连接服务端 websocket，并在本机侧适配 SeedX 事件。
- `packages/`：跨 mobile / server / daemon 共享的契约、领域类型或生成物。只有真正出现跨端重复时再新增。
- `infra/local/`：本地 Postgres、服务编排和开发依赖配置。
- `scripts/`：仓库级自动化脚本，供人和 Agent 直接调用。

## 运行拓扑

MVP 目标拓扑：

1. Mobile app 通过 API 读取和写入个人记录。
2. Go server 持久化记录到 Postgres，并提供 Ask / extraction 的接口边界。
3. SeedX daemon 在用户设备启动后主动连接 Go server 的 websocket 地址。
4. Go server 通过 websocket 向 daemon 投递 SeedX 事件，daemon 返回 mock 或真实 SeedX response。

当前 mobile skeleton 还没有接入 server，使用本地 mock 数据展示核心信息架构和 UI 语言。

## 边界

- Mobile app 负责低 effort capture、记录回看、趋势展示、Ask 入口和隐私 / 导出入口。
- Server 负责数据持久化、API boundary、websocket session 管理和审计友好的日志。
- Daemon 负责本机 SeedX 连接、事件转发、重连和本机日志。
- AI 能力只做记录整理、趋势回顾和有来源的回答，不做诊断、治疗、药物或急症判断。

## 本地验证入口

- Mobile typecheck：`cd apps/mobile && npm run typecheck`
- Mobile web preview：`cd apps/mobile && npx expo start --web --port 8081`
- 文档检查：`make check-docs`

随着 server、daemon 和 Postgres 落地，本节需要继续补齐对应启动、测试和观测命令。
