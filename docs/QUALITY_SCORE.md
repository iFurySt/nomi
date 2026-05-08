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
| 产品面 | B | 已有 Nomi MVP spec、非医疗边界、设计原则和原生 iOS skeleton，capture 结果会写入 server records 并在下次启动恢复。 | 下一步把 record 图片资源本身纳入持久化或本地缓存。 |
| 架构文档 | B | 已替换为 Nomi 的 mobile / server / Postgres 目标结构，明确复用本机 `seedx` CLI daemon，并记录图片 AI extraction contract。 | server、SeedX command 调度和 Postgres 落地后继续补启动与数据流细节。 |
| 前端 | B | 原生 SwiftUI iOS app skeleton 已成为唯一移动端实现，覆盖 home-only 首页真实空态、从真实 timeline items 派生的今日健康数据总览、低装饰紧凑 timeline、居中 Add icon 上拉上传 sheet、左侧 sidebar 语言切换、Photos / Files 选择边界、server image extraction adapter、server records persistence adapter 和 Liquid Glass 风格动画。 | 继续接入真实 camera、图片资源持久化、真实模型 adapter 和更细的 UI 自动化测试。 |
| 测试 | B | Server image extraction 单测和本地四图 Photos / Files endpoint smoke 已覆盖；原生 iOS 已通过 iPhone 17 Pro simulator build / install / launch、首页 / 上传 sheet / sidebar 截图 smoke、真实 PhotosPicker / fileImporter XCUITest 上传到 Today timeline、sidebar 中英文切换 XCUITest，以及 simulator-only `NOMI_E2E_AUTO_UPLOADS` 四图 Photos / Files AI path smoke。 | 增加 camera capture 真机链路、持久化 store 集成测试、真实模型 adapter 测试和仓库级 mobile check 命令。 |
| 后端 | B | Go server 可启动，health、records、Ask mock、`POST /ai/extract-image` deterministic extraction boundary、Postgres schema 和 SeedX `/daemon/connect` endpoint 已落地；SeedX websocket 支持 Bearer API key。 | 补 records / Ask 用户认证、Postgres 集成测试、图片请求大小限制和真实模型 adapter。 |
| 部署 | B | Server 已有 Dockerfile、amoylab Compose 模板、`server-v*` tag 触发的 GHCR 镜像发布和受限 SSH 自动部署链路；amoylab 默认只本机暴露未认证 API。 | 补公开访问前的认证 / 反向代理 / TLS，并把部署健康检查继续沉淀到更完整的 smoke。 |
| 可观测性 | C | Server 已使用 Zap 日志，websocket smoke 能看到 connected / sent / received。 | 补 metrics / traces、websocket 指标和结构化 request id。 |
| 安全 | C | 已明确敏感数据、本地凭据、AI 阻断、未认证 API 限制，并给 SeedX websocket 补了 API key header 认证。 | 接入真实 API 前补用户认证、请求大小限制、CORS、删除实现和第三方 AI 同意流程。 |
