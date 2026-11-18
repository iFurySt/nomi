## [2026-11-17 23:36] | Task: 让文稿 AI 按意图生成架构图

### Execution Context

- Agent ID: `/root`
- Base Model: GPT-6 系列，具体运行变体未提供
- Runtime: Codex，本机 Electron / Node

### User Query

> 提交推送既有修复。BPE 只想要 Corpus → Training → Vocabulary / Merge Rules → Tokenizer 的架构图，一句语料直接得到结果，不要表格操作面板。

### Changes Overview

Scope: core / host / UI / scripts / Skill / docs。

- 先将既有交互块复制、toast、空行与两步删除修复提交并推送为 `8c7be9e`；本记录为后续架构图改动。
- 增加 portable Diagram@1：有界静态 DAG，安全子树内容，真实分叉 / 汇合箭头；最长节点局部滚动，宿主适配尺寸和深浅色。
- 文稿生成先选择架构图、线性教学或数据对比；纯 Diagram 不再强制伪造输入控件，原始 Canvas 对象仍拒绝。
- BPE 架构图用可修改语料直接执行最多 32 次教学合并，完整词表和有序规则显示在对应节点。新增同源示例及真实模型输出 fixture。
- 流式预览只显示已到达子树和完整端点；最终仍严格验证引用、环、预算和能力。
- 同步仓库 Skill 的流程、contract、示例与独立验证 runtime，更新生成及运行时文档。

### Design Intent

原提示词要求所有输出带操作控件，又偏向四表范例，导致架构图请求被强行转为实验。增加平台中立的节点关系语义，同时明确选择构图的规则；不开放生成 HTML / JavaScript，也不要求移动端复用 DOM。

### Validation

- `pnpm check`、相关 7 个测试文件 / 85 个测试通过。
- `node scripts/check-interactive-diagram.mjs` 验证作者与真实生成两份程序的五节点五边、无表格、语料变化、空输入、深浅色、420px、局部滚动与连线几何。
- `node scripts/check-note-generation.mjs` 通过，覆盖流式预览、连续调整、撤销重做、取消及过期结果；同步更新扩展后的错误文案断言。
- Skill 全部五份示例校验 / 行为轨迹通过；skill-creator metadata 校验通过（隔离 uv 环境提供 PyYAML）。
- 使用开发版现有 ChatGPT 连接，向 GPT-6.1-Sol 发送合成架构请求：2.5 秒首次 delta、31.2 秒完成，返回预期五节点五边，无 Table / Stepper；程序保留为 fixture，未编辑模型原始程序。
- `pnpm build` 通过；确认开发版已保存后仅重启 Nomi(Dev)，在独立 `BPE architecture check` 文稿导入真实生成文件，观察五节点与连线并确认保存。未修改正式版或用户既有文稿。
- 截图：`docs/generated/verification/nomi-bpe-diagram-generated-{light,dark-narrow}-2026-11-17.png`。

### Limits

当前 Diagram 仅支持有向无环图、默认从上到下排版，没有任意位置 / 环路 / 边标签；旧客户端和未实现的移动 renderer 按未知能力拒绝。真实生成仅验收一个合成 case，不能保证每次模型输出的布局品质。BPE 是字符级教学算法，有 32 次合并预算。

### Key Files

- `packages/core/src/interactive/diagram.ts`
- `packages/core/src/interactive/bpe-diagram.json`
- `packages/core/src/interactive/fixtures/generated-bpe-diagram.json`
- `packages/host/src/canvas-generation-prompt.ts`
- `packages/ui/src/interactive/InteractiveDiagram.tsx`
- `scripts/check-interactive-diagram.mjs`
- `skills/nomi-interactive/SKILL.md`
