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
| 前端 | B | Expo app 可启动，已从 Snap / Log / Review 收口为 iPhone 优先的 upload-only 工作台；底栏中央 FAB 可动画展开拍摄、相册、文件入口，真实 picker 已接入，上传处理态和原图 / cutout / AI 分类结果可截图验证；已新增 iOS Vision cutout Expo module。 | 用 iOS development build 验证 native cutout 编译和真机输出，接入 server persistence、真实 AI 分类 adapter 和更细的组件测试。 |
| 测试 | C | 已有 mobile TypeScript 检查、domain smoke、Expo web smoke 截图。 | 增加更细的组件 / store 测试和仓库级 mobile check 命令。 |
| 后端 | B | Go server 可启动，health、records、Ask mock、Postgres schema 和 SeedX `/daemon/connect` endpoint 已落地；SeedX websocket 支持 Bearer API key。 | 补 records / Ask 用户认证、Postgres 集成测试和 mobile API adapter。 |
| 可观测性 | C | Server 已使用 Zap 日志，websocket smoke 能看到 connected / sent / received。 | 补 metrics / traces、websocket 指标和结构化 request id。 |
| 安全 | C | 已明确敏感数据、本地凭据、AI 阻断、未认证 API 限制，并给 SeedX websocket 补了 API key header 认证。 | 接入真实 API 前补用户认证、请求大小限制、CORS、删除实现和第三方 AI 同意流程。 |
