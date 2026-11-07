## [2026-11-07 15:58] | Task: 收紧 AI 未连接入口

### Execution Context

- Agent: `/root`
- Runtime: Codex desktop

### User Query

未连接状态底部出现大片空白，连接操作不够明确；需要按钮悬停反馈、默认聚焦和回车触发。

### Changes

- 文稿 AI 外层脱离网格布局，修复隐式第二行挤短侧栏的问题；仅卡片捕获指针。
- 共用生成组件的未连接状态收为紧凑卡片，连接入口使用主按钮样式与悬停 / 按下 / 键盘焦点反馈。
- 未连接时聚焦连接入口，连接后聚焦输入框；继续沿用原有设置导航与 Escape 关闭。
- 更新 UIUX_REFERENCE 的入口约定。

### Files

- `packages/ui/src/canvas/GenerateCanvas.tsx`
- `packages/ui/src/canvas/generation.css`
- `packages/ui/src/writing/writing.css`

### Validation

类型检查、生产构建、diff 空白检查通过。重启 Nomi(Dev)，实际在测试文稿输入 `/ai`：默认焦点位于连接入口，第二次 Enter 进入 ChatGPT 设置；返回后再打开、Escape 可关闭。截图确认侧栏恢复全高，卡片与连接按钮紧凑。未操作正式版或在线登录。
