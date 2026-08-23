# 旧知识库迁移与 App 资料投影

## 目标

把 `nomi-codex` 中已经整理好的家庭健康资料安全迁入生产真实家庭 workspace，并将可复用的 AI 沉淀补录为 Postgres knowledge projection，让 iOS 能以简洁列表查看既有资料，同时继续支持基于完整 workspace 的对话。

## 范围

- 包含：iOS 文案精简、legacy staging、Leo/Lin person 映射、raw-data/ai-vault 无覆盖导入、knowledge projection、生产部署与验证。
- 不包含：删除或改写 `nomi-codex`、公开迁移接口、自动诊断、把审核家庭与真实家庭合并。

## 背景

- 相关文档：`docs/ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/SECURITY.md`、`docs/RELIABILITY.md`。
- 相关代码路径：`apps/server/internal/app/`、`apps/ios/Nomi/`、`infra/amoylab/`。
- 已知约束：生产真实家庭当前只有 Leo person，尚未物化 workspace；审核家庭有独立 workspace，不能被迁移触碰；原知识库以 `leo`/`lin` slug 组织，生产 workspace 以 person UUID 组织。

## 风险

- 风险：同步到错误 household 或覆盖生产文件。
- 缓解方式：按 household name 精确解析真实家庭；审核家庭显式排除；先落独立 staging 和备份；导入只允许“目标不存在”或“内容 hash 相同”，不静默覆盖差异文件。
- 风险：直接把 Markdown 当 job 导致 PG 语义混乱。
- 缓解方式：新增独立 knowledge projection；job 继续只表示异步处理任务。
- 风险：一次性 SQL 或人工 person UUID 映射不可重复。
- 缓解方式：提供只在 server CLI 暴露的幂等导入命令，按显示名确保 person 并记录 source path/hash 唯一键。

## 里程碑

1. 精简 iOS 文案并新增 knowledge 列表。
2. 实现 legacy workspace importer 与幂等 projection。
3. 部署 server、备份并同步真实资料。
4. 上传新 TestFlight build，完成生产 App API 与分发验证。

## 验证方式

- 命令：`go test -race ./...`、`go vet ./...`、`make ci`、iPhone 17 Pro simulator build/XCUITest。
- 手工检查：真实家庭出现 Leo/Lin scope；资料 API 返回导入条目；审核家庭计数不变。最终视觉确认由用户更新 Build 6 后完成。
- 观测检查：生产 health、容器 health、SeedX service；导入前后文件/knowledge/person 计数；重复执行 importer 不新增重复条目。

## 进度记录

- [x] 盘点原知识库和生产 household/workspace；确认真实家庭与审核家庭隔离。
- [x] 完成 iOS 精简与 knowledge projection。
- [x] 完成 importer、测试和 `server-v0.2.4` 部署。
- [x] 备份、rsync staging 并执行生产导入。
- [x] 验证 App API、数据隔离、重复导入幂等性和 TestFlight 分发；不为验收在真实家庭中制造测试对话，用户更新后可按需发起。

## 决策记录

- 2026-08-23：只迁移稳定 `raw-data` 与 `ai-vault`，不复制原仓库 `.git`、`tmp`、`_incoming` 或 `_templates`。
- 2026-08-23：本机先 rsync 到生产独立 staging，再由 server CLI 按 PG person UUID 导入真实 workspace；CLI 不允许覆盖内容不同的既有目标文件。
- 2026-08-23：新增 knowledge projection 展示既有 AI 沉淀，不把导入文档伪装成历史异步 jobs。
- 2026-08-23：生产导入新增 565 个稳定文件和 81 条 knowledge；重复执行新增文件为 0，审核家庭 knowledge 仍为 0。
- 2026-08-23：Build 6 已进入内部/外部组并获 `BETA_APPROVED`；生产认证 API 返回 81 条，工程计划关闭，真机视觉体验由用户直接验收。
