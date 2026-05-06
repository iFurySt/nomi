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
| 架构文档 | B | 已替换为 Nomi 的 mobile / server / daemon / Postgres 目标结构。 | server、daemon 和 Postgres 落地后继续补启动与数据流细节。 |
| 前端 | B | Expo app 可启动，六个必需界面可切换，Capture 能写入本地 records，Timeline 和 Ask 会读取本地状态。 | 接入持久化、本地图表派生数据和真实 API adapter。 |
| 测试 | C | 已有 mobile TypeScript 检查、domain smoke、Expo web smoke 截图。 | 增加更细的组件 / store 测试和仓库级 mobile check 命令。 |
| 可观测性 | D | server / daemon 尚未实现，日志和 websocket 观测还没落地。 | Go skeleton 阶段引入 zap structured logs 和本地 websocket smoke。 |
| 安全 | C | 产品 spec 已明确敏感数据、删除、导出和非医疗边界。 | 接入真实 API 前补隐私文案、数据删除实现和第三方 AI 同意流程。 |
