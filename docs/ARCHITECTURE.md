# 架构总览

Nomi / 知己 是一个个人身体与生活记录产品。第一阶段目标是先交付可运行的 MVP skeleton：移动端已从 React Native + Expo 原型开始迁移到原生 SwiftUI iOS app，后端用 Go，数据库使用 Postgres，并复用相邻 `../seedx` 仓库自带的 daemon 主动建连能力。云端部署、家庭协作和 Apple Watch 接入在后续阶段处理。

## 当前仓库结构

- `apps/ios/`：原生 SwiftUI iOS app。当前先实现 iPhone 优先的 mobile skeleton：首页包含顶部全局总览和今日上传 timeline，导航栏 `+` 打开上拉上传 sheet；Ask / Trends 先作为占位 tab。视觉方向使用系统字体、SwiftUI sheet、Liquid Glass 风格按钮 / 玻璃卡片和轻量动画。
- `apps/mobile/`：Expo mobile app。保留为迁移前的 React Native 原型和 domain smoke 载体。当前收敛为 iPhone 优先的单一上传工作台：底部使用悬浮玻璃导航，中央圆形入口展开拍摄 / 相册 / 文件三种来源，选择后进入原图 AI 分类、上传处理动画和原图 / 抠图区分展示；保存仍写入本地内存 records，Ask boundary smoke 保留在 domain 层。
- `apps/server/`：Go API server。当前提供 health、record persistence、Ask mock boundary、Postgres schema 初始化和 SeedX daemon websocket 控制面。
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
3. `../seedx` 的 `seedx daemon connect` 在用户设备启动后主动连接 Go server 的 websocket 地址。
4. Go server 通过 SeedX daemon 协议发送 `daemon:ping` / 后续 `daemon:command`，SeedX 返回 `daemon:pong` / `daemon:result`。

当前原生 iOS app 还没有接入 server，首页 timeline 使用本地 SwiftUI state 展示示例记录；上传 sheet 通过 PhotosPicker / fileImporter 选择图片，保存后插入本地 timeline。React Native app 仍使用本地内存 records 保存上传结果，并用 mock AI 分类展示 capture 保存路径。原图选择已经通过 Expo camera / image library / document picker 接到真实 picker 边界；iPhone 端侧抠图由本地 Expo iOS module `modules/nomi-image-cutout/` 封装，使用 iOS 17+ Vision foreground instance mask 生成透明 PNG。Expo web 预览和未包含该 module 的 Expo Go 只能展示 native unavailable 状态；真实 cutout 需要 iOS development build / prebuild。Go server 已提供 `GET /health`、`GET /records`、`POST /records`、`POST /ask`，并在启动时初始化 Postgres records schema。SeedX 连接使用 `GET /daemon/connect`，同时保留旧的 `GET /seedx/ws` 兼容本地 smoke；daemon API key 通过 `Authorization: Bearer ...` WebSocket 握手 header 传递。

## 边界

- Mobile app 负责低 effort capture、记录回看、趋势展示、Ask 入口和隐私 / 导出入口。
- Server 负责数据持久化、API boundary、websocket session 管理和审计友好的日志。
- SeedX 负责本机 daemon 连接、事件转发、重连、runtime capability 和本机日志；Nomi 不维护重复 daemon。
- AI 能力只做记录整理、趋势回顾和有来源的回答，不做诊断、治疗、药物或急症判断。

## 本地验证入口

- Mobile typecheck：`cd apps/mobile && npm run typecheck`
- Mobile domain smoke：`cd apps/mobile && npm run smoke`
- Mobile web preview：`cd apps/mobile && npx expo start --web --port 8081`
- Native iOS build：`xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme NomiNative -configuration Debug -destination 'platform=iOS Simulator,id=<simulator-udid>' build`
- Native iOS simulator run：`xcrun simctl install <simulator-udid> ~/Library/Developer/Xcode/DerivedData/NomiNative-*/Build/Products/Debug-iphonesimulator/NomiNative.app && xcrun simctl launch --terminate-running-process <simulator-udid> dev.nomi.native`
- Server tests：`cd apps/server && go test ./...`
- Server local run：`cd apps/server && NOMI_SEEDX_API_KEY=dev_seedx_key go run ./cmd/nomi-server --addr :8088`
- SeedX daemon tests：`cd ../seedx && go test ./internal/transport/daemonclient ./internal/cli`
- SeedX daemon websocket smoke：先启动 server，再运行 `cd ../seedx && go run ./cmd/seedx daemon connect --server-url http://localhost:8088 --api-key dev_seedx_key --once`
- 文档检查：`make check-docs`

随着 server、SeedX command 调度和 Postgres 集成测试落地，本节需要继续补齐对应启动、测试和观测命令。
