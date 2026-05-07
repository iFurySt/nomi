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
| 产品面 | B | 已有 Nomi MVP spec、非医疗边界、设计原则和 mobile skeleton。 | 下一步让 capture 真正写入本地 record store。 |
| 架构文档 | B | 已替换为 Nomi 的 mobile / server / Postgres 目标结构，并明确复用 `../seedx` daemon。 | server、SeedX command 调度和 Postgres 落地后继续补启动与数据流细节。 |
| 前端 | B | 新增原生 SwiftUI iOS app skeleton，已覆盖首页全局总览、紧凑今日 timeline、底部中央 `+` 上拉上传 sheet、较小的暖色玻璃底栏、底栏按住左右滑动切换 tab、Photos / Files 选择边界、占位 tab 和 Liquid Glass 风格动画；Expo app 仍可启动，保留 upload-only 工作台和 iOS Vision cutout Expo module。 | 继续把原生 iOS 接入持久化 record store、真实 camera / Photos / Files 上传 E2E、AI 分类 adapter 和更细的 UI 自动化测试。 |
| 测试 | C | 已有 mobile TypeScript 检查、domain smoke、upload source / save record 映射覆盖、Expo web smoke 截图；原生 iOS 已通过 iPhone 17 Pro simulator build / install / launch 和首页、上传 sheet 截图 smoke；本地 Expo iOS XCUITest 已覆盖 upload FAB、camera unavailable 反馈、Files picker、Photos picker、Files 选文件后 review / Upload 保存路径、Photos 选图后 review / Upload 保存路径，以及 deep link fixture 下的 camera-source review / Upload 保存路径。 | 给原生 SwiftUI app 增加 UI test target，覆盖打开上传 sheet、picker 选择后的 Upload 保存路径和 timeline 插入；增加 camera capture 真机链路和仓库级 mobile check 命令。 |
| 后端 | B | Go server 可启动，health、records、Ask mock、Postgres schema 和 SeedX `/daemon/connect` endpoint 已落地；SeedX websocket 支持 Bearer API key。 | 补 records / Ask 用户认证、Postgres 集成测试和 mobile API adapter。 |
| 可观测性 | C | Server 已使用 Zap 日志，websocket smoke 能看到 connected / sent / received。 | 补 metrics / traces、websocket 指标和结构化 request id。 |
| 安全 | C | 已明确敏感数据、本地凭据、AI 阻断、未认证 API 限制，并给 SeedX websocket 补了 API key header 认证。 | 接入真实 API 前补用户认证、请求大小限制、CORS、删除实现和第三方 AI 同意流程。 |
