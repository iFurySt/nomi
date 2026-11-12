## 2026-11-11 23:30 | Task: 将紧凑 BPE 原型落为可复用 DSL

### 用户诉求

将 Skill 正式维护在仓库 skills 中，把确认的 BPE 原型转成 Nomi DSL 并实际应用；界面采用简洁黑白灰与少量蓝色。

### 改动

- `skills/README.md` 明确仓库为正式来源；更新 Skill、设计规范、组件契约和可独立运行的验证器。
- Table / Button / TextInput 的增强能力使用组件版本 2：语义词元、行高亮、长表展开、图标和主次按钮、输入修改后重置关联状态。保持版本 1 兼容。
- BPE 输出补充下一次合并标签、实际合并位置和分组词频；紧凑示例与内置生成提示使用同一份 DSL。
- renderer 使用四张紧凑表、黑色主操作按钮与蓝色联动高亮，隔离文稿排版影响；窄屏自动纵向排列。
- 更新交互运行时、创作 Skill 与 UIUX 文档。

### 验证

- 相关 core / generation 单测：4 文件、48 项通过。
- Skill 结构校验及独立离线检查通过。
- 交互运行检查通过：合并、回退、重置、空输入、完成状态、展开、深浅色和窄屏布局。
- 前端构建通过；实际 Nomi(Dev) 导入新示例，操作并重启后确认状态恢复，保存实际截图。未修改正式版或用户 Transformer 文稿。
- 复核时并行 automation 类型问题已解决，全仓 `pnpm check` 和完整 `pnpm build` 通过。

### 边界

本轮没有重新调用线上模型；验证的是 DSL 和真实渲染、交互。外部 Agent 可生成 `.nomi-ui.json` 后通过交互块导入，直接粘贴 HTML/JSON 尚未实现。新增组件版本要求更新后的 renderer；移动端原生实现仍待接入。

### 关键文件

- `packages/core/src/interactive/{types,validate,functions}.ts`
- `packages/core/src/interactive/bpe-compact.json`
- `packages/ui/src/interactive/{InteractiveRenderer,InteractiveTable}.tsx`
- `packages/ui/src/interactive/learning.css`
- `packages/host/src/canvas-generation-prompt.ts`
- `scripts/build-interactive-skill.mjs`
- `skills/nomi-interactive/SKILL.md`

### 原型细节复核

按原型修正三种高亮语义：候选行平整浅蓝底、待合并词元成对包裹、规则与词表只强调新结果词元。新增通用受限的词元分组与连接符、表格短提示 / 列对齐 / 空态、输入隐藏标签；生成示例使用六行窗口、候选表达式和完整合并规则，统一词尾符号。版本 2 尚未发布，新增字段随契约与离线校验器同步。补充非法分组 / 连接符及渲染高亮回归。

复核已在重启后的 Nomi(Dev) 重新导入当前 DSL，并实际合并一轮检查三个高亮区域、列宽和词尾显示，保存开发版截图；同步更新本机 Skill 副本与分发 ZIP。
