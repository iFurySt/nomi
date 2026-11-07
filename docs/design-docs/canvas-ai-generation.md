# ChatGPT 生成画布与交互实验

## 当前实现

Canvas 工具栏的 AI 生成入口复用 Settings → ChatGPT 的 OAuth、动态模型列表、刷新、取消和使用额度处理。只有已连接且授予 `chatgpt.tokens.use.direct` 的账号才能调用。没有增加 API key 计费或 Codex CLI 依赖。

用户输入描述后调用现有 Responses 通道，`generation: "canvas"` 只选择 host 内版本化的固定提示词，不能传自定义系统指令；该模式关闭 Agent / 外部工具。首版只发送用户填写的描述，不读取已有文稿、附件或选区。

返回 JSON `{commands:[...]}`，只允许新增 shape / markdown / interactive block 与绑定它们的连线。结果长度上限 32,000 字符、命令数 60；新场景经过既有文档与交互 IR 校验，不允许覆盖、删除、任意资源引用或执行代码。所有 ID 在插入前重新分配，作为单笔 Canvas 事务加入现有内容右侧，自动定位，可一次撤销；原有内容不改动。

入口是紧凑输入框，只展示输入、模型与发送。Enter 发送，Shift+Enter 换行，输入法组词期间不提交；发送后输入框动画收至右侧，显示短状态和停止按钮。窄屏停靠底部，系统减少动态效果时取消动画。

Responses 的真实文本 delta 到达后，`canvasGenerationPrefix` 只提取已经闭合的完整命令对象，逐次调用同一个严格校验器。临时场景直接显示在画布上，复用内容 renderer、完整连线样式与路由；每个块、连线到达时淡入。自动取景为右侧输入框留出空间。临时层不参与选择、编辑与持久化；最终完整响应再次校验后，才作为一次事务插入。并非等全部生成完成后用定时器播放。

关闭、停止、切换账号或组件卸载时取消该 requestId；停止和失败清理临时内容，迟到结果不显示也不写入。非法输出显示简短重试提示。没有自动修复循环、连续对话或修改已有图示，每次发送都是独立描述。

## 交互实验能力边界

GenUI 是已有 portable learning IR，只有 Panel / Row / Text / Button / SegmentedControl / Slider / Math / Plot，运算目前为 math.softmax / array.at / array.replaceAt。提示词携带合法示例与能力集合。超出能力范围应生成诚实的说明图，不能把静态图声称为真实仿真。新增通用数学、物理或动画能力需要扩展 IR、预算与跨语言 conformance。

## 验证与入口

- `pnpm exec vitest run packages/core/src/canvas/generation.test.ts packages/host/src/chatgpt.test.ts`
- `node scripts/check-canvas-generation.mjs`：隔离测试账号与模拟响应，真实增量事件模拟、逐块 / 连线、原子插入 / 撤销、非法输出、取消 / 关闭后的迟到结果、IME、浅深色 / 窄屏；不是在线调用验证。
- 旧版交互中，用户完成实际授权后曾验证模型列表与三步流程图的在线生成 / 预览；临时图未写入用户画布。新版流式界面尚未进行真实账号端到端调用；在线交互实验尚未单独验收。

实现：core `canvas/generation.ts`，host `canvas-generation-prompt.ts`，UI `canvas/GenerateCanvas.tsx`。官方接入参考：https://developers.openai.com/siwc/token-sharing-open-source/sign-in
