## 2026-11-07 14:28 | Task: 文稿画布的悬停、键盘与预览缩放

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop

### User Query

> 工具栏仅悬停显示；选中画布后可删除；确认 Enter 在画布下新增一行；触控板缩放预览时自动选中。

### Changes

- 单击预览明确聚焦画布，清理遗留文字选区；悬停与选中分别控制工具栏和尺寸点。
- Delete / Backspace 删除当前文稿的块引用，保留场景并支持撤销；Enter 原子插入下方空段并聚焦。双击 / Space / 编辑按钮仍进入编辑，斜杠菜单插入画布仍直接打开。
- 非 passive 监听 Chromium 的触控板捏合事件，围绕鼠标缩放 25–300%，阻止整页缩放和滚动；普通滚轮仍交给文稿。缩放与偏移只保留在视图状态，不写历史。
- 同步文稿编辑契约，增加真实 Electron 鼠标点击 / 键盘 / Ctrl+wheel 回归与截图。

### Files

- `packages/ui/src/canvas/EmbeddedCanvasBlock.tsx`
- `packages/ui/src/canvas/CanvasScenePreview.tsx`
- `packages/ui/src/canvas/embedded-canvas.css`
- `packages/ui/src/pages/Notes.tsx`
- `scripts/check-notes-canvas.mjs`
- `docs/design-docs/notes-authoring.md`

### Validation

- 类型检查、生产构建、完整内嵌画布 Electron 回归通过。
- 回归覆盖悬停浮栏可达、选中后移出隐藏、Enter 输入焦点、两种删除键及撤销、缩放光标锚点 / 自动选中 / 文稿滚动与 revision 不变、八向尺寸、编辑器复用、深浅色、窄屏和离线。
- 触控板路径通过 Chromium Ctrl+wheel 输入验证；未将自动事件测试声称为实体触控板手势验收。
- 仅重启 Nomi(Dev)，在独立示例页实际点击画布、Enter 输入、撤销、删除和撤销恢复，并截图检查已保存状态；未操作正式 App 或用户正文。
