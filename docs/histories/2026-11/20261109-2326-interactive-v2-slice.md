## 2026-11-09 23:26 | Task: 实现 portable 交互块 v2 与流式生成

### Execution Context

- Agent: `/root`
- Runtime: Codex desktop，开发验收仅 Nomi(Dev)

### 用户诉求

实现同一 DSL 的多端交互块基础能力，实际测试 AI 生成质量，尽可能流式展示并自行检查效果。

### 改动

- 新增 portable draft-2，保留 draft-1；字符串输入、set 动作、纯计算、BPE、Table / Metric / Scene。
- 新增已闭合节点子树的严格流式预览，保留最终原子插入和取消保护。
- 多主题提示词和范例；真实生成 BPE、波形及继续聊天调整，保留合成 IR 回归用例。
- 修正数值负零、错误派生计算恢复、交互按钮被文稿样式覆盖；适配窄屏和深色。
- 同步运行时、架构、设计状态、生成流程及独立验收记录。

### 验证

类型检查、单元测试、构建；文稿和画布生成 UI 回归；交互 v2 输入 / 重置 / 持久化 / 图形联动；390px 和深色截图检查；既有 Swift draft-1 的 18,500 次数值比较通过。实际在线生成与继续调整均完成，没有编辑用户文稿。

### 边界

本次交付可原生实现的语义协议和 Electron renderer。未开放任意 HTML / JavaScript，也没有宣称完成 iOS / Android renderer；后续阶段见 v2 设计。保留其他会话已有改动，本轮未发版。

### 主要文件

- `packages/core/src/interactive/`
- `packages/core/src/canvas/generation-preview.ts`
- `packages/host/src/canvas-generation-prompt.ts`
- `packages/ui/src/interactive/`
- `scripts/check-interactive-v2.mjs`
- `docs/design-docs/interactive-v2-validation.md`

### 2026-11-11 BPE 原始需求复核

- 正式版 0.3.2 安装包不含 draft-2 / BPE，开发构建含有；此差异不能用重写用户提示词解决。
- 用户原话在开发版首轮生成成功，真实按钮完成最高频 pair 合并，候选频次表随之变化。
- 修正语义：当前分词的频次表不能冒充完整学习词表；新增保留字符及历史 token 的 `learnedVocabulary`，稳定教学 ID 与当前频次分开。
- 提示范例改为预填句子、并排候选与分词、保留句子的重新开始；生成约束明确要求候选表和完整学习词表。
- 保存第二次真实生成的句子实验 IR，加入可重复行为与渲染回归；并排面板改为顶部对齐。
- 本轮类型检查、17 项针对测试、构建、Electron 渲染回归通过；人工查看桌面 / 390px 截图。实际改句子、单步、四轮结束、重新开始均正确，已重启 Nomi(Dev) 并确认保存恢复。
