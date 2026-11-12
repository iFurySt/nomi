# 外部 Agent 生成 Nomi 交互块

状态：2026-11-11，已提供仓库内标准 Skill 包与紧凑 DSL renderer；沿用现有导入入口。

## 目标与入口

用户希望将已确认的紧凑 BPE 体验沉淀为生成规则，在对话式 Agent、Claude Code 等不同 harness 中制作交互块，再放入 Nomi 文稿。

仓库真相源为 [`skills/nomi-interactive`](../../skills/nomi-interactive/SKILL.md)。Skill 不依赖特定模型、ChatGPT 账号或工具 API，包含：

- 简短创作流程、少文案的设计标准、当前能力契约。
- 可导入的紧凑 BPE、波形与温度实验定义。
- 从 core 打包的无外部依赖 Node 校验器，检查结构、能力、默认值及指定动作轨迹。
- 同源许可证；分发包内运行时遵循仓库 AGPL-3.0-only。

在支持 Skill 的 Agent 中加载整个文件夹；不支持自动发现的对话环境可上传完整包，要求读取 `SKILL.md` 和相关引用。不要假设所有聊天客户端都会自动安装或执行 Skill。若不能执行校验器，输出须标记尚未验证。

## 交付契约与当前边界

外部 Agent 输出单个 `<subject>.nomi-ui.json`，根对象为 InteractiveProgram，不能包在 Canvas commands 中。用户在文稿目标位置插入「交互块」，选择「导入交互定义（.json）」；代码位于 Notes 的 `importProgram`，校验后走现有文稿事务。

直接在正文粘贴 JSON / HTML 转交互块尚未实现；Skill 不声称该能力已经可用。HTML 仅用于体验预览，当前不执行生成 HTML / JS。支持 draft-2 的开发运行时可导入；0.3.2 发布版缺少该扩展。跨端共享计算与动作语义，不承诺 HTML 自动转原生 UI。

已确认的 BPE HTML 原型已转换为可导入 DSL，包含候选联动高亮、词元 chip、图标按钮、行数折叠和紧凑布局。通过组件 version 2 显式声明增强；不同平台遵循相同交互语义，以各自 renderer 适配布局。

## 维护与验证

```sh
node scripts/build-interactive-skill.mjs
node scripts/check-interactive-skill.mjs
```

构建脚本从实际 core 打包 parser / evaluator，从 host 生成契约同步 reference，复制已验证的示例，再生成精简 BPE 变体。生成文件一并提交，外部 Agent 只需 Node 22+，无需仓库依赖或网络。core / 生成契约改变时同轮重新构建并验证包，不手改生成的 runtime.mjs。

行为检查覆盖三份示例、`ab ab ac` 第一轮与完成词表、回退、保留语料重启、空输入、Unicode 输入、非法能力和越界状态。校验通过只证明契约与计算，视觉品质仍需在目标 renderer 中验收。


## 2026-11-11 实际渲染对齐

Skill 正式来源在 `skills/nomi-interactive/`，入口为标准 `SKILL.md`；`skills/README.md` 记录生成 / 验证流程。新增的紧凑 BPE 是 `packages/core/src/interactive/bpe-compact.json`，与 Skill asset 同源生成，并被 host 用作生成示例。

Table / Button / TextInput 通过组件 version 2 显式声明增强，其他组件保持 version 1。Table 可配置折叠行数、首尾窗口、绝对高亮行，单元格可含 tokens/emphasis；Button 支持语义图标、主次操作、禁用；TextInput 可重置相关 state。黑白灰为基础，少量蓝色用于关联数据，Row 在窄容器自动堆叠。折叠是本地视图状态，计算、完整数据与进度不被截断。旧组件和旧 DSL 继续兼容；不支持新版本的客户端应明确回退，不能默默丢弃交互。

BPE 保持原算法，新增分组词元行、下一次合并标签、完成状态和高亮索引；输入变化重置 step。这里验证的是已确认原型的 DSL 转换与真实 renderer，不代表每次在线模型生成都能达到相同质量。移动端仍需实现这些版本化语义，HTML/JS 执行边界不变。
