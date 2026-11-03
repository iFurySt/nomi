# ChatGPT 生成画布与交互实验

## 当前实现

Canvas 工具栏的 AI 生成入口复用 Settings → ChatGPT 的 OAuth、动态模型列表、刷新、取消和使用额度处理。只有已连接且授予 `chatgpt.tokens.use.direct` 的账号才能调用。没有增加 API key 计费或 Codex CLI 依赖。

用户输入描述后调用现有 Responses 通道，`generation: "canvas"` 只选择 host 内版本化的固定提示词，不能传自定义系统指令；该模式关闭 Agent / 外部工具。首版只发送用户填写的描述，不读取已有文稿、附件或选区。

返回 JSON `{commands:[...]}`，只允许新增 shape / markdown / interactive block 与绑定它们的连线。结果长度上限 32,000 字符、命令数 60；新场景经过既有文档与交互 IR 校验，不允许覆盖、删除、任意资源引用或执行代码。所有 ID 在插入前重新分配，作为单笔 Canvas 事务加入现有内容右侧，自动定位，可一次撤销；原有内容不改动。

预览复用现有内容 renderer 与连线路由，适应窗口宽度，可滚动查看及操作实验。关闭或停止后取消该 requestId，迟到结果不显示也不写入。非法输出展示错误，用户可修改描述后重试；目前没有自动修复循环、连续对话或修改已有图示。

## 交互实验能力边界

GenUI 是已有 portable learning IR，只有 Panel / Row / Text / Button / SegmentedControl / Slider / Math / Plot，运算目前为 math.softmax / array.at / array.replaceAt。提示词携带合法示例与能力集合。超出能力范围应生成诚实的说明图，不能把静态图声称为真实仿真。新增通用数学、物理或动画能力需要扩展 IR、预算与跨语言 conformance。

## 验证与入口

- `pnpm exec vitest run packages/core/src/canvas/generation.test.ts packages/host/src/chatgpt.test.ts`
- `node scripts/check-canvas-generation.mjs`：隔离测试账号与模拟响应，预览、插入、撤销、非法输出、取消、浅深色 / 窄屏；不是在线调用验证。
- 用户完成实际授权后，已验证模型列表与三步流程图的在线生成 / 预览；临时图未写入用户画布。在线交互实验尚未单独验收。

实现：core `canvas/generation.ts`，host `canvas-generation-prompt.ts`，UI `canvas/GenerateCanvas.tsx`。官方接入参考：https://developers.openai.com/siwc/token-sharing-open-source/sign-in
