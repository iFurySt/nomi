# 架构总览

Nomi / 知己 是一个个人身体与生活记录产品。第一阶段目标是先交付可运行的 MVP skeleton：移动端现在收敛到原生 SwiftUI iOS app，后端用 Go，数据库使用 Postgres，并复用本机 `seedx` CLI 暴露的 daemon 主动建连能力。云端部署、家庭协作和 Apple Watch 接入在后续阶段处理。

## 当前仓库结构

- `apps/ios/`：原生 SwiftUI iOS app。当前先实现 iPhone 优先的 mobile skeleton：首页默认不填假 timeline，摄入能量、蛋白质、训练、步行、久坐、睡眠等今日总览从真实上传记录派生；timeline 为空时显示真实空态。底部是暖色小玻璃导航栏，中间 Add 上传项以普通导航项样式打开上拉上传 sheet，并在真实 PhotosPicker / fileImporter 选择图片后调用 server image extraction contract 生成 timeline 项。Trends / Log / Me 先作为占位 tab。视觉方向使用系统字体、SwiftUI sheet、Liquid Glass 风格按钮 / 玻璃卡片、轻量动画和可按住左右滑动的连续选中态流动。
- `apps/server/`：Go API server。当前提供 health、record persistence、Ask mock boundary、图片 AI 提取边界、Postgres schema 初始化和 SeedX daemon websocket 控制面。
- `infra/amoylab/`：amoylab server 部署模板，包含 Docker Compose 和环境变量示例；真实部署目录是 `amoylab:/opt/nomi`。
- `docs/product-specs/`：产品规格和 MVP 验收范围。
- `docs/exec-plans/completed/`：已完成的跨 milestone 执行计划。
- `docs/generated/verification/`：本地验证生成物，例如 UI 截图。
- `docs/`：仓库知识库，也是本地规则和上下文的正式来源。

## 计划中的结构

- `apps/server/`：Go API server，负责 record、ask/mock、Postgres 访问和 SeedX daemon control endpoint。
- `packages/`：跨 mobile / server 共享的契约、领域类型或生成物。只有真正出现跨端重复时再新增。
- `infra/local/`：本地 Postgres、服务编排和开发依赖配置。
- `scripts/`：仓库级自动化脚本，供人和 Agent 直接调用。

## 运行拓扑

MVP 目标拓扑：

1. Mobile app 通过 API 读取和写入个人记录。
2. Go server 持久化记录到 Postgres，并提供 Ask / extraction 的接口边界。
3. `seedx daemon connect` 在用户设备启动后主动连接 Go server 的 websocket 地址。
4. Go server 通过 SeedX daemon 协议发送 `daemon:ping` / 后续 `daemon:command`，SeedX 返回 `daemon:pong` / `daemon:result`。

当前原生 iOS app 首页 timeline 启动时通过 `GET /records` 加载服务端已保存记录，初始状态不注入假数据；上传 sheet 通过 PhotosPicker / fileImporter 选择图片，上传时把 image data base64、来源和 MIME type 发送到 `POST /ai/extract-image`，再把 extraction title、input category、confidence 和 metadata 通过 `POST /records` 持久化，同时插入本地 timeline。Go server 已提供 `GET /health`、`GET /records`、`POST /records`、`POST /ask`、`POST /ai/extract-image`，并在启动时初始化 Postgres records schema。图片提取 schema 覆盖 input category（food、beverage、caffeine、alcohol、nicotine、information、exercise、sunlight、social）、output impacts（energy、mood、sleep、recovery、focus、health）和 kcal、protein、fat、carbs、fiber、water、caffeine、nicotine、duration 等 metadata；当前实现是服务端 deterministic 边界，后续接真实模型时保持该 contract。SeedX 连接使用 `GET /daemon/connect`，同时保留旧的 `GET /seedx/ws` 兼容本地 smoke；daemon API key 通过 `Authorization: Bearer ...` WebSocket 握手 header 传递。

## 边界

- Mobile app 负责低 effort capture、记录回看、趋势展示、Ask 入口和隐私 / 导出入口。
- Server 负责数据持久化、API boundary、websocket session 管理和审计友好的日志。
- SeedX 负责本机 daemon 连接、事件转发、重连、runtime capability 和本机日志；Nomi 不维护重复 daemon。
- AI 能力只做记录整理、趋势回顾和有来源的回答，不做诊断、治疗、药物或急症判断。

## 本地验证入口

- Native iOS build：`xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=<simulator-udid>' build`
- Native iOS simulator run：`xcrun simctl install <simulator-udid> ~/Library/Developer/Xcode/DerivedData/NomiNative-*/Build/Products/Debug-iphonesimulator/Nomi.app && xcrun simctl launch --terminate-running-process <simulator-udid> dev.nomi.native`
- Native iOS upload UI test：`xcodebuild test -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=<simulator-udid>' -only-testing:NomiNativeUITests/NomiNativeUploadFlowUITests`
- Server tests：`cd apps/server && go test ./...`
- Server local run：`cd apps/server && NOMI_SEEDX_API_KEY=dev_seedx_key go run ./cmd/nomi-server --addr :8088`
- SeedX daemon websocket smoke：先启动 server，再运行 `seedx daemon connect --server-url http://localhost:8088 --api-key dev_seedx_key --once`
- 文档检查：`make check-docs`
- Server tag release：递增 `server-v*` tag 并 push，触发 GHCR 镜像构建和 amoylab 部署；详见 `docs/DEPLOYMENT.md`。

随着 server、SeedX command 调度和 Postgres 集成测试落地，本节需要继续补齐对应启动、测试和观测命令。
