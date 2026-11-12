# 交互块 v2 第一版验收

日期：2026-11-09。范围是 portable draft-2 的第一版，不是任意 HTML / JS 执行或完整移动原生 renderer。

## 真实在线生成

仅在 Nomi(Dev) 新建合成验收文稿，通过已有模型连接实际生成；没有读取或编辑用户正在写的文稿。模型使用 GPT-6.1-Sol。下面的生成结果不是预先固定的 mock。

| 请求 | 实际观察 | 行为核对 |
| --- | --- | --- |
| 可编辑语料的 BPE，默认 `ab ab ac`，单步 / 重置 / 分词 / 规则 / 词表 | 一次生成成功；回复完成前已经出现标题、输入框和步骤控件 | 第一步合并 a+b，频次 2；改成 `aaaa` 后得到 `aa · aa · </w>`，重置恢复初始语料 |
| 振幅 / 频率控制正弦波，另用小球显示 x=1 位移 | 一次生成成功，使用 Plot + Scene + Metric，不是温度样例 | f=1.9、A=1 时数值为 -0.588，小球和曲线 marker 一致 |
| 继续调整同一个波形：x=0..2、512 点 | 第二轮原位替换成功，保留会话；生成中逐节点预览 | 控件和小球继续可用，没有新增重复交互块 |

发现并修正：高频折线采样偏稀（提示词要求按最大频率控制可见周期、512 点）；接近零的格式化负零；文稿通用按钮样式覆盖交互块按钮。BPE 初次结果的边界说明略长，提示词进一步要求避免技术限额段落、只留简短说明。两类案例不足以代表所有生成主题均已达到成品质量。

## 可复现回归

真实生成的最终 IR 保存于 `packages/core/src/interactive/fixtures/generated-bpe.json` 与 `generated-wave.json`；仅保留合成实验内容，没有账号、请求日志或用户文稿上下文。BPE / wave.json 是独立编写的提示词范例，和在线生成 fixture 明确分开。

- `pnpm check`、`pnpm test`、`pnpm build`。
- `packages/core/src/interactive/v2.test.ts`：独立 BPE 参考、重复 / 重叠 / Unicode / 空输入、边界、动作 / 重置、派生计算失败恢复、版本隔离、预算、闭合节点流式、非法能力、实际生成波形独立正弦数值与 Scene 坐标。
- `node scripts/check-interactive-v2.mjs`：隔离 Electron 实际 renderer；输入重算、步骤、状态重开、坏输入可恢复、重置、曲线变化、实际生成的小球联动、390px 与深色截图。生成图片位于 ignored `.artifacts/interactive-v2/`，已人工查看。
- `node scripts/check-note-generation.mjs`：文稿生成、连续调整、取消 / 迟到结果、过期结果保护、上下文、撤销 / 重做与持久化回归通过。
- `node scripts/check-canvas-generation.mjs`：画布增量 / 连线、原子插入、取消、坏输出、IME、浅深色 / 窄屏通过。
- `pnpm check:interactive-native`：既有 draft-1 Swift / TypeScript 的 5 个快照、18,500 个数值比较通过；不包含 draft-2 原生支持。

## 边界

所有生成仍限定于声明式数据及登记函数，无网络 / 文件 / 宿主动作。流式预览只显示通过严格验证的闭合子树，最终内容独立校验后原子提交。UI 窄屏证明同一 DSL 可自适应 Web 容器，不代表已经开发 SwiftUI / Compose。时间轴、3D、HTML / JS 扩展、完整原生 renderer 仍按 v2 总设计后续推进。

## 2026-11-11：用户原始 BPE 请求复核

本机正式版 0.3.2 安装包没有 portable draft-2 和 BPE 能力，开发构建有。未收到用户对本次尝试使用哪个版本的确认，因此不能把版本差异当作其失败的唯一原因。

用用户原始中文需求在 Nomi(Dev) 两次真实生成，均得到输入框、单步按钮及候选频次表。第二次使用改进后的生成约束：左右分别是当前拆分和候选词对，下方是规则与完整学习词表。原始模型输出留在 `generated-bpe-sentence.json`，没有手动美化或替换内容。

实际操作核对：
- 默认句子第一步 a+r → ar，频次 3，词元数 39 → 36。
- 将输入改成 `ab ab ac`，重新开始保留新输入；四次合并完成，词元数 9 → 3，候选表清空，4 条规则、8 个已学习词元。
- 完整词表保留当前频次为零的初始字符和中间词元；原 `vocabulary` 仍表示当前分词频次，新增 `learnedVocabulary` 表示完整学习词表。
- 恢复预填句子后重启开发版，实验内容和初始状态正常恢复。

本轮检查：`pnpm check`、交互 v2 与画布生成 17 项测试、`pnpm build`、`node scripts/check-interactive-v2.mjs` 均通过。新增回归覆盖真实生成的默认句子、候选表 / 完整词表绑定、重置保留输入与合并终止。截图人工检查桌面和 390px；修正并排面板高度不同时垂直居中的问题。图片位于 `.artifacts/interactive-v2/run-7kDe78/`。

开发版保留 `BPE sentence lab` 供直接体验；本轮未改生产文稿、未发布新版本。输入仍受当前教学计算预算限制，不是任意长度语料训练或生产 tokenizer。
