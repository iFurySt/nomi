# Nomi MVP Skeleton Execution Plan

## 后续校正

2026-05-06 后续 dogfood 确认 `../seedx` 已提供 `seedx daemon connect --server-url --api-key`、`/daemon/connect` 和 Bearer API key header。Nomi 已移除自有 `apps/seedx-daemon` skeleton，当前运行入口以 `docs/ARCHITECTURE.md` 和 `README.md` 为准。本计划下方的 `apps/seedx-daemon` 内容只记录当时已完成的 milestone，不再代表当前架构。

## 目标

把当前模板仓库推进到 Nomi / 知己 的第一阶段可运行骨架：React Native + Expo mobile app、Go server、SeedX local daemon、Postgres 本地依赖和可验证的 mock AI / domain boundary。每完成一个可独立验收的 milestone，都要先验证、截图或记录证据，再提交。

## 范围

- 包含：产品与设计文档收口、Expo mobile app 骨架、核心屏幕、低 effort capture flow、mock 数据与 AI adapter、Go API server、SeedX daemon 主动连接服务端 websocket、Postgres 本地开发配置、基础测试和 smoke verification。
- 不包含：真实 SeedX 模型调用、云端部署、家庭协作、Apple Watch 接入、真实认证、App Store 发布、医疗诊断或治疗能力。

## 背景

- 相关文档：`docs/product-specs/nomi-mvp.md`、`docs/DESIGN.md`、`docs/FRONTEND.md`、`docs/ARCHITECTURE.md`、`docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`。
- 相关代码路径：计划新增 `apps/mobile/`、`apps/server/`、`apps/seedx-daemon/`、`packages/`、`infra/local/`。
- 已知约束：App 应保持 niche、Apple-like、less is more 的体验；AI 行为必须守住非医疗边界；SeedX 后续运行在用户设备上，daemon 启动后主动连接服务端 websocket；数据库使用 Postgres；服务端使用 Go 和主流依赖。

## 风险

- 风险：一次性脚手架过大，验证和回滚困难。
- 缓解方式：按 milestone 拆小提交；每个 milestone 只交付一个可运行切片，并保留验证命令或截图证据。
- 风险：设计被做成通用 health dashboard 或医疗产品。
- 缓解方式：把 `docs/DESIGN.md` 和 product spec 作为 UI 文案、颜色和信息密度的验收来源；避免诊断、风险、异常等医疗语义。
- 风险：SeedX / websocket 协议边界不清，后续接入成本高。
- 缓解方式：先定义稳定 envelope、event type、mock handler 和 reconnect 行为，真实 SeedX payload 保持透明转发或最薄 adapter。

## 里程碑

1. 产品定义与执行计划。
   - 收口 MVP spec、设计原则和本 execution plan。
   - 运行仓库文档检查。
   - 提交文档 milestone。
2. Mobile app skeleton。
   - 初始化 `apps/mobile/` Expo app。
   - 搭建 Home、Timeline、Capture、Trends、Ask、Settings 的基础导航和 mock UI。
   - 用 Expo web 或 iOS simulator 验证首屏和核心路径，保留截图。
   - 提交 mobile skeleton。
3. Mobile domain flow。
   - 增加本地 mock record store、领域模型、capture 保存饮食 / 身体数据 / 图片记录、timeline 回看、trends mock chart 和 Ask 医疗边界阻断。
   - 增加最小测试或可运行 smoke command。
   - 提交 mobile domain flow。
4. Go server + Postgres skeleton。
   - 新增 `apps/server/`，提供 health、record、ask/mock API skeleton。
   - 新增 Postgres 本地配置、schema / migration 入口和 README。
   - 验证服务启动、healthcheck 和数据库连接。
   - 提交 server skeleton。
5. SeedX daemon + websocket skeleton。
   - 新增 `apps/seedx-daemon/`，daemon 主动连接 server websocket。
   - 定义事件 envelope、reconnect、logging 和 mock SeedX response。
   - 验证 server 与 daemon 双进程本地通信。
   - 提交 daemon skeleton。
6. 收尾验收。
   - 更新 `docs/ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/QUALITY_SCORE.md`、history 和 release note。
   - 运行仓库级 CI / smoke 流程。
   - 做 completion audit。

## 验证方式

- 命令：`make check-docs`、`make check-repo`、mobile lint / test / Expo start smoke、server Go tests、daemon Go tests、Postgres healthcheck。
- 手工检查：每个 UI milestone 使用 Expo + browser use / computer use 检查首屏、核心导航和 capture path，并保存截图或记录截图路径。
- 观测检查：server 和 daemon 使用 structured logs；websocket milestone 需要在日志中看到 daemon connected、event received、mock response sent。

## 进度记录

- [x] 确认 Nomi MVP 产品范围、非医疗边界和设计方向。
- [x] 完成产品定义与执行计划 milestone 验证并提交。
- [x] 完成 mobile app skeleton。
- [x] 完成 mobile domain flow。
- [x] 完成 Go server + Postgres skeleton。
- [x] 完成 SeedX daemon + websocket skeleton。
- [x] 完成最终验收和 plan 归档。

## 决策记录

- 2026-05-06：第一阶段使用 mock AI adapter 先固定产品入口、领域模型和安全边界，避免真实 SeedX 接入阻塞 MVP skeleton。
- 2026-05-06：移动端使用 React Native + Expo，服务端和 daemon 使用 Go；Postgres 作为本地和后续云端一致的数据存储方向。
- 2026-05-06：每个 milestone 都必须先做本地验证再提交，降低跨端脚手架一次性堆叠的回归风险。
- 2026-05-06：第一阶段 skeleton 已完成并归档；真实 mobile API adapter、认证、Postgres 集成测试、metrics / traces 和真实 SeedX payload 进入后续计划。
