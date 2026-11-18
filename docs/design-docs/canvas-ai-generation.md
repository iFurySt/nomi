# ChatGPT 生成画布、文稿与交互块

## 当前实现

Canvas 工具栏的 AI 生成入口复用 Settings → ChatGPT 的 OAuth、动态模型列表、刷新、取消和使用额度处理。只有已连接且授予 `chatgpt.tokens.use.direct` 的账号才能调用。没有增加 API key 计费或 Codex CLI 依赖。

用户输入描述后调用现有 Responses 通道，`generation: "canvas"` 只选择 host 内版本化的固定提示词，不能传自定义系统指令；该模式关闭 Agent / 外部工具。Canvas 模式只发送用户填写的描述；文稿模式仅在明确调用 AI 时发送下述有界上下文，不读取附件或其他文稿。

返回 JSON `{commands:[...]}`，只允许新增 shape / markdown / interactive block 与绑定它们的连线。结果长度上限 32,000 字符、命令数 60；新场景经过既有文档与交互 IR 校验，不允许覆盖、删除、任意资源引用或执行代码。所有 ID 在插入前重新分配，作为单笔 Canvas 事务加入现有内容右侧，自动定位，可一次撤销；原有内容不改动。

入口是紧凑输入框，只展示输入、模型与发送。Enter 发送，Shift+Enter 换行，输入法组词期间不提交；发送后输入框动画收至右侧，显示短状态和停止按钮。窄屏停靠底部，系统减少动态效果时取消动画。

Responses 的真实文本 delta 到达后，`interactiveGenerationPrefix` 提取已经闭合的完整命令对象，并可提前提取交互块中已闭合且通过校验的视图子树，逐次调用同一个严格校验器。临时场景直接显示在画布上，复用内容 renderer、完整连线样式与路由；每个块、连线到达时淡入。自动取景为右侧输入框留出空间。临时层不参与选择、编辑与持久化；最终完整响应再次校验后，才作为一次事务插入。并非等全部生成完成后用定时器播放。

关闭、停止、切换账号或组件卸载时取消该 requestId；停止和失败清理临时内容，迟到结果不显示也不写入。非法输出显示简短重试提示。没有自动修复循环、连续对话或修改已有图示，每次发送都是独立描述。

## 文稿上下文生成

文稿的 `/ai`、选区工具栏「添加到对话」和右下 AI 按钮统一打开右侧聊天栏。宽屏为正文让出空间，侧栏可在 320–640px 间拖宽；窄屏使用右侧抽屉。消息独立滚动，输入固定底部，Enter 发送、Shift+Enter 换行、IME 期间不发送。收起保留会话与草稿；新对话、切换文稿 / ChatGPT 账号或离开页面清空临时会话。当前仅内存保存，不建立持久或云端聊天记录。

`generation: "note-chat"` 使用 host 固定协议，返回 `{"reply":"Markdown","commands":[]}`，reply 在前。普通解释 / 讨论留在对话，明确要求生成时才返回 add_block；可生成 Markdown 或安全交互 DSL，不允许原始 Canvas shape / connector 或任意宿主动作。完整结果校验后原子插入。原 `generation: "note"` 保留用于旧调用方及生成验收，继续要求交互块 / Diagram。

`noteContext` 必须包含有界快照：标题最多 256 字符、选区最多 4,000 字符、光标前后各 1,500 字符。不会自动读取整篇、其他文稿、附件原件或嵌套画布。选中文字会追加批注；非文本块属性菜单「添加到 AI 对话」追加有界块定义。每次最多 8 条、单条引用 8,000 / 评论 1,000、总引用与评论 16,000 字符，全部由 host 再验证。图片 / 文件仅包含块引用元信息，不代表模型看到了图像。

选区工具栏点击后在原文旁显示紧凑输入框；Enter / 勾选确认，Shift+Enter 换行，IME 不提交，Escape / 点外部取消新草稿。确认后输入框仅展示「N 条批注」标签，悬停或点击展开引用 / 评论列表，最高 360px（同时受视口可用高度约束），内部滚动；可逐条编辑 / 移除或清空。正文蓝色编号可点击原位编辑，保存才更新评论，取消保留原值，也可直接删除。正文显示蓝色选区或块边框。文字高亮使用 ProseMirror decoration，随位置移动；原文被修改或删除后撤掉失效高亮，引用快照仍在输入区。它不写入 Markdown、撤销历史或同步数据。发送成功后引用进入该条用户消息，并清空待发送列表。生成中暂不追加批注，防止尚未发送的引用被清掉。

成功往返按消息保存；每轮携带用户文字、当轮批注及成功助手输出，固定上下文作为不可信参考数据传入，关闭工具。界面输入最多 2,000 字符；含编码批注的 note-chat 用户消息和助手输出各不超过 32,000，整个消息输入不超过 100,000。客户端压缩旧消息对并保留最近一次生成定义，最多 98 条旧消息；失败 / 取消不进入模型历史。普通聊天的 2,000 字符用户消息限制不变。

文字 reply 流式显示，已闭合命令 / 原生节点继续走严格临时预览；半段源码不执行、不落盘。后续生成要求返回完整新版块组，仅原子替换本会话上次生成、仍连续且未被修改的块。首次生成不替换选区。手动修改 / 删除 / 重排 / 撤销后的结果不被覆盖。原位置或块顺序过期时拒绝写入并提示开启新对话；停止、收起、切换页面会取消请求并忽略迟到响应。

## 交互块能力边界

当前默认生成 `nomi-interactive-ir/draft-2` / `portable.learning/draft-2`，兼容旧温度程序。除原有八种组件外支持 TextInput、Metric、Table、Scene、TokenFlow、Stepper、Diagram；状态增加有界字符串，动作增加表达式 `set`。纯计算函数包括基础数学、数据访问、格式化、字符级 BPE 教学训练。完整契约与预算见 [运行时](interactive-learning-runtime.md)。

提示词提供 Temperature、BPE 四表 / 引导 / 架构图、正弦波等范例，要求每个控件实际影响输出；旧生成模式超出能力返回 `{"error":"unsupported_interaction"}`；note-chat 则用 reply 简述限制、commands 为空，不以静态图或无关温度实验冒充。振荡曲线建议 512 点并限制可见周期，说明保持简短。真实生成仍需数值与行为验收，合法 IR 不保证教学内容正确。

流式协议要求 placement 在 block 前，program 的元信息 / state / derived / actions / root 在 nodes 前，父节点在子节点前。只有闭合节点参与临时树；未到达的 child 引用暂时过滤，循环 / 重复节点 / 非法能力不展示。预览经过与最终结果相同的严格校验，不运行半段源码，不落盘；最终结果必须满足完整树和相应的实验 / Diagram 要求。模型未遵循字段顺序时回退为完整命令预览。

本轮没有开放生成 HTML / JavaScript、网络、文件或宿主动作。Web 扩展及原生移动呈现仍按 [v2 设计](interactive-content-v2.md) 后续实施。

## 验证与入口

- `pnpm exec vitest run packages/core/src/canvas/generation.test.ts packages/host/src/chatgpt.test.ts`
- `node scripts/check-canvas-generation.mjs`：隔离测试账号与模拟响应，真实增量事件模拟、逐块 / 连线、原子插入 / 撤销、非法输出、取消 / 关闭后的迟到结果、IME、浅深色 / 窄屏；不是在线调用验证。
- `node scripts/check-note-generation.mjs`：模拟文稿请求，覆盖右栏布局 / 拖宽 / 收起重开、普通多轮问答不改文稿、文字与块批注、深色窄屏、生成骨架、保留会话、连续调整原位替换及历史、失败/取消保留结果、过期结果保护、段落间临时预览、原生交互块的滑块与数值联动、重开恢复进度、拒绝原始画布图示回退 / 不支持交互、一次撤销及重做、停止与过期位置、选区入口、IME 和离开页面的迟到响应。
- `pnpm exec vitest run packages/ui/src/writing/noteAI.test.ts packages/host/src/chatgpt.test.ts`：上下文边界、其他文稿隔离、host 协议及关闭工具。
- 2026-11-07 已重启 Nomi(Dev)，通过 Computer Use 在线生成原生温度交互块，再发送第二条指令修改标题；确认仅更新原结果、保留聊天输入，调整滑块后概率值实时变化。测试仅使用新建的开发验收文稿。
- 旧版交互中，用户完成实际授权后曾验证模型列表与三步流程图的在线生成 / 预览；临时图未写入用户画布。文稿模式的在线连续调整验收见上一项。

实现：core `canvas/generation.ts`，host `canvas-generation-prompt.ts`，UI `canvas/GenerateCanvas.tsx`（画布）与 `writing/NoteChat.tsx`（文稿）。官方接入参考：https://developers.openai.com/siwc/token-sharing-open-source/sign-in

2026-11-09 实际在线 BPE / 波形生成和连续调整、390px 与深色验证见 [v2 验收记录](interactive-v2-validation.md)。

## 2026-11-17 架构图按意图生成

Diagram@1 直接引用已有安全视图子树，边只连接其直接子节点；最多 16 个节点 / 24 条有向边，禁止自环、环路、重复边及悬空引用。节点拓扑静态，节点内文本和数据可由既有表达式计算；Electron 负责自动分层、测量和箭头，不要求模型输出坐标。流式阶段仅保留已到达的节点和两端齐全的边；最终仍严格验证完整定义。

生成规则先区分架构关系、逐步教学和数据对比。后续“只要架构图”覆盖上一轮表格构图。BPE 范例为 Corpus → BPE Training → Vocabulary / Merge Rules → Tokenizer；修改一句语料直接计算最多 32 次合并，完整训练词表和有序规则留在对应节点，长内容局部滚动。该训练预算与字符级算法属于教学示例，不代表生产 tokenizer。

使用开发版现有订阅连接真实调用 GPT-6.1-Sol：31.2 秒完成、2.5 秒首次文本 delta，返回五节点五边，无 Table / Stepper。原始合成输出的程序存入 `packages/core/src/interactive/fixtures/generated-bpe-diagram.json`，结构校验及修改语料、清空、浅深色 / 窄屏由 `node scripts/check-interactive-diagram.mjs` 复验。该证据证明一次真实生成成功，不保证模型每次输出一致。
