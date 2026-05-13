# 架构总览

Nomi / 知己 是一个个人身体与生活记录产品。第一阶段目标是先交付可运行的 MVP skeleton：移动端现在收敛到原生 SwiftUI iOS app，后端用 Go，数据库使用 Postgres，并复用本机 `seedx` CLI 暴露的 daemon 主动建连能力。云端部署、家庭协作和 Apple Watch 接入在后续阶段处理。

## 当前仓库结构

- `apps/ios/`：原生 SwiftUI iOS app。当前先实现 iPhone 优先的 home-only mobile skeleton：首页默认不填假 timeline，摄入能量、蛋白质、训练、步行、久坐、睡眠等今日总览从真实上传记录派生；timeline 为空时显示真实空态。底部使用 iOS 26 原生 `TabView` Liquid Glass tab bar：左侧 Today / 我的为普通 tab 组，右侧 Add 使用 `TabRole.search` 分离成独立圆形 action，中间空档和选中 glass 高亮交给系统处理。Add 只打开上拉上传 sheet 并回到上一个内容 tab；真实 PhotosPicker / fileImporter 选择图片后调用 server image extraction contract 生成 timeline 项。底部“我的”进入 My 页，当前只保留语言切换；首次启动自动写入识别出的中 / 英语言，后续可在 English / 简体中文 / 繁體中文之间切换。视觉方向使用系统黑白灰语义色、系统字体 / Dynamic Type、SwiftUI 系统 sheet 外层圆角、Liquid Glass 风格按钮 / 玻璃卡片和轻量动画。
- `apps/macos/`：原生 SwiftUI macOS app。当前以 SwiftPM executable 形式提供 `Nomi`，手工 `.app` / `.dmg` 对外统一打包为 `Nomi`，并复用移动端 logo 生成 macOS app icon；复用同一个 Go server `/records` 和 `/ai/extract-image` contract。界面参考 `LandmarksBuildingAnAppWithLiquidGlass`，用 SwiftUI `WindowGroup` 承载原生 `NavigationSplitView(preferredCompactColumn:)` sidebar + 右侧内容区，覆盖健康看板、记录列表详情、添加记录 overlay 和图片预览 overlay。窗口红黄绿按钮、sidebar toggle 和当前 section title 交给 macOS 系统 titlebar / toolbar；toolbar 暂时只保留一个参考 Landmarks Collections 写法的原生 `+` Add 按钮，搜索入口先不放回 toolbar。sidebar 使用系统 `.sidebar` List 外壳加自定义深灰选中和 hover 行，并参考 Landmarks 的原生 `List` sidebar 密度约束列宽、收紧行高和左右 inset，让行项目更接近 macOS 原生 sidebar。Add overlay 和图片预览 overlay 都直接叠在当前页面上，不虚化或移动底层内容；Add overlay 支持面板外点击、Escape 和应用失焦关闭。Add overlay 优先选择 / 拖拽图片并通过本地 server + SeedX/Codex 生成记录，也保留简单文字记录 fallback。
- `apps/server/`：Go API server。当前提供 health、record persistence、Ask mock boundary、图片上传落盘、SeedX/Codex 图片提取、Postgres schema 初始化和 SeedX daemon websocket 控制面。
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
2. macOS app 通过同一组 API 读取和写入个人记录，先覆盖桌面端回看、图片导入分析和简单添加。
3. Go server 持久化记录到 Postgres，并提供 Ask / extraction 的接口边界。
4. `seedx daemon connect` 在用户设备启动后主动连接 Go server 的 websocket 地址。
5. Go server 通过 SeedX daemon 协议发送 `daemon:ping` / 后续 `daemon:command`，SeedX 返回 `daemon:pong` / `daemon:result`。

当前原生 iOS app 首页 timeline 启动时通过 `GET /records` 加载服务端已保存记录，初始状态不注入假数据；上传 sheet 通过 PhotosPicker / fileImporter 选择图片，上传时把 image data base64、来源和 MIME type 发送到 `POST /ai/extract-image`。Go server 先把图片写入 `NOMI_IMAGE_STORAGE_DIR`，再通过已连接的 SeedX daemon 发送 `daemon:command` / `method:"run"`，让本机 Codex 使用 SeedX 0.2.0 的 Codex v2 `input` contract 分析图片：`input[0]` 是严格 JSON prompt，`input[1]` 是 `{ "type": "localImage", "path": "..." }`。server 解析结果后把 title、input category、confidence、image URI 和 metadata 写入 `records`，再把带 `record_id` 的 extraction 返回给 iOS，同时插入本地 timeline。Go server 已提供 `GET /health`、`GET /records`、`POST /records`、`POST /ask`、`POST /ai/extract-image`，并在启动时初始化 Postgres records schema。图片提取 schema 覆盖 input category（food、beverage、caffeine、alcohol、nicotine、information、exercise、sunlight、social）、output impacts（energy、mood、sleep、recovery、focus、health）和 kcal、protein、fat、carbs、fiber、water、caffeine、nicotine、duration 等 metadata。SeedX 连接使用 `GET /daemon/connect`，同时保留旧的 `GET /seedx/ws` 兼容本地 smoke；daemon API key 通过 `Authorization: Bearer ...` WebSocket 握手 header 传递。

## 边界

- Mobile app 负责低 effort capture 和记录回看；趋势、Ask、隐私 / 导出等入口等到产品信息架构明确后再放回主界面。
- Server 负责图片落盘、AI extraction 调度、数据持久化、API boundary、websocket session 管理和审计友好的日志。
- SeedX 负责本机 daemon 连接、事件转发、重连、runtime capability 和本机日志；Nomi 不维护重复 daemon。
- AI 能力只做记录整理、趋势回顾和有来源的回答，不做诊断、治疗、药物或急症判断。

## 本地验证入口

- Native iOS build：`xcodebuild -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=<simulator-udid>' build`
- Native iOS simulator run：`xcrun simctl install <simulator-udid> ~/Library/Developer/Xcode/DerivedData/Nomi-*/Build/Products/Debug-iphonesimulator/Nomi.app && xcrun simctl launch --terminate-running-process <simulator-udid> com.ifuryst.nomi`
- Native iOS upload UI test：`xcodebuild test -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=<simulator-udid>' -only-testing:NomiUITests/NomiUploadFlowUITests`
- Native iOS TestFlight release：`docs/IOS_TESTFLIGHT_RELEASE.md` 记录 `com.ifuryst.nomi` / team `J9P29FA5BX` / App Store Connect App ID `6767420142` 的手动 archive 和 upload 流程。
- Native macOS app build：`cd apps/macos/Nomi && ./scripts/build-app.sh`
- Native macOS dmg build：`cd apps/macos/Nomi && ./scripts/build-dmg.sh`
- Native macOS run：启动 server 后运行 `cd apps/macos/Nomi && NOMI_API_BASE_URL=http://127.0.0.1:8088 .build/Nomi.app/Contents/MacOS/Nomi`
- Server tests：`cd apps/server && go test ./...`
- Server local run：`cd apps/server && NOMI_SEEDX_API_KEY=dev_seedx_key go run ./cmd/nomi-server --addr :8088`
- SeedX daemon local run：先启动 server，再运行 `seedx daemon connect --server-url http://localhost:8088 --api-key dev_seedx_key`；`--once` 只验证 hello，不会处理图片分析 command。
- 文档检查：`make check-docs`
- Server tag release：递增 `server-v*` tag 并 push，触发 GHCR 镜像构建和 amoylab 部署；详见 `docs/DEPLOYMENT.md`。

随着 server、SeedX command 调度和 Postgres 集成测试落地，本节需要继续补齐对应启动、测试和观测命令。
