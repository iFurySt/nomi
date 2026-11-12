## 2026-11-12 | Task: 交互块复制与 DSL 编辑

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop

### 用户诉求

交互块支持复制，并提供可手动修改的 DSL 入口。

### 改动

- 文稿与画布共用悬浮复制、DSL 工具栏，平时隐藏。
- 复制完整程序定义，文稿光标处粘贴后创建独立交互块；不复制个人学习进度。
- DSL 草稿支持原生输入、撤销、粘贴；校验通过后原子应用，取消不写入，拒绝覆盖编辑期间发生的外部变化。
- 新增 `set_interactive` 命令，保留块身份和引用，支持宿主撤销。
- 更新交互内容设计和生成 skill 的交付说明。

### 关键文件

- `packages/ui/src/interactive/InteractiveTools.tsx`
- `packages/ui/src/canvas/InteractiveBlock.tsx`
- `packages/ui/src/pages/Notes.tsx`
- `packages/core/src/canvas/document.ts`
- `scripts/check-interactive-authoring.mjs`

### 验证

- 文档命令测试 26 项通过。
- 交互渲染回归通过，包含 DSL 非法输入、取消、应用。
- 隔离 Electron 验证光标粘贴、复制往返、独立副本和修改撤销。
- 类型检查与桌面构建通过；重启开发版后实际打开 DSL 弹窗，验证原生输入撤销、取消，以及复制后粘贴成从第 0 轮开始的独立 BPE 交互块。生产版与用户原稿未修改。
