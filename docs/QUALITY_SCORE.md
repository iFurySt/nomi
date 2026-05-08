# 质量评分

用这份文档按产品区域和架构层次记录当前质量水位，方便持续知道最薄弱的地方在哪。

## 建议的评分标准

- `A`：覆盖完整、行为稳定、文档清楚、运行风险低。
- `B`：整体可接受，但还有明确短板。
- `C`：能用，但需要针对性补强。
- `D`：脆弱、缺少规范，或很多行为尚未定义。

## 当前评分

| 区域 | 评分 | 原因 | 下一步 |
| --- | --- | --- | --- |
| 产品面 | B | 已有 Nomi MVP spec、非医疗边界、设计原则和原生 iOS skeleton，capture 结果会写入 server records 并在下次启动恢复；图片文件本身已由 server 落盘。 | 下一步补图片资源读取 / 删除能力和用户可见隐私说明。 |
| 架构文档 | B | 已替换为 Nomi 的 mobile / server / Postgres 目标结构，明确复用本机 `seedx` CLI daemon，并记录 SeedX/Codex 图片 AI extraction contract。 | SeedX command 协议扩展为一等图片输入后继续收敛 prompt / payload 形状。 |
| 前端 | B | 原生 SwiftUI iOS app skeleton 已成为唯一移动端实现，覆盖 home-only 首页真实空态、从真实 timeline items 派生的今日健康数据总览、低装饰紧凑 timeline、原生 `TabView` / `TabRole.search` Liquid Glass 双分组底栏、Add 上拉上传 sheet、My 页语言切换、Photos / Files 选择边界、server image extraction adapter、Debug 本地 API / Release 线上 API 切换和 Liquid Glass 风格动画。 | 继续接入真实 camera、图片资源展示、真实模型更多异常态和更细的 UI 自动化测试。 |
| 测试 | B | Server image extraction 单测、SeedX daemon command 单测和本地多图 Photos / Files endpoint smoke 已覆盖；原生 iOS 已通过 iPhone 17 Pro simulator build / install / launch、首页 / 上传 sheet / 底部双分组截图 smoke、真实 PhotosPicker / fileImporter XCUITest 上传到 Today timeline、底部 Add / My / 语言 sheet 入口 XCUITest，以及 simulator-only `NOMI_E2E_AUTO_UPLOADS` AI path smoke。 | 增加 camera capture 真机链路、Postgres 集成测试、真实 Codex 多图回归集和仓库级 mobile check 命令。 |
| 后端 | B | Go server 可启动，health、records、Ask mock、`POST /ai/extract-image` 图片落盘、SeedX/Codex prompt 调度、Postgres record persistence 和 SeedX `/daemon/connect` endpoint 已落地；SeedX websocket 支持 Bearer API key。 | 补 records / Ask 用户认证、Postgres 集成测试、图片读取 / 删除、CORS 和更完整请求审计。 |
| 部署 | B | Server 已有 Dockerfile、amoylab Compose 模板、`server-v*` tag 触发的 GHCR 镜像发布和受限 SSH 自动部署链路；iOS 已有手动 TestFlight archive/upload 流程和 App Store Connect 记录；amoylab 默认只本机暴露未认证 API。 | 补公开访问前的认证 / 反向代理 / TLS，把部署健康检查继续沉淀到更完整的 smoke；后续需要时再把 iOS TestFlight 从本机手动流程升级为 CI secret 驱动。 |
| 可观测性 | C | Server 已使用 Zap 日志，websocket smoke 能看到 connected / sent / received。 | 补 metrics / traces、websocket 指标和结构化 request id。 |
| 安全 | C | 已明确敏感数据、本地凭据、AI 阻断、未认证 API 限制，并给 SeedX websocket 补了 API key header 认证。 | 接入真实 API 前补用户认证、请求大小限制、CORS、删除实现和第三方 AI 同意流程。 |
