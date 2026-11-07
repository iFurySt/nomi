# 画布绘制工具

按四组整理左侧居中工具栏；形状和连线悬停选择，选择后拖动绘制；独立文本工具和快捷键提示；紧凑标题避开 macOS 窗口按钮，撤销 / 重做移到标题旁。

验证：实际指针拖绘、点击不立即插入、反向拖动、Esc 取消、撤销恢复、连线样式、hover 菜单和键盘、窄屏布局；构建后重启 App 并截图。保留此前未提交修复和真实文稿。

## 完成

- 四组工具、悬停菜单与快捷键提示、形状 / 文本拖绘、四种连线模式已实现。
- 预览只存在于视图，松开提交一次；Esc 取消，撤销 / 重做恢复。
- 标题与历史控件紧凑并避开窗口按钮，工具栏垂直居中。
- `pnpm check`、`pnpm build`、`node scripts/check-notes-canvas.mjs`、`node scripts/check-canvas.mjs` 通过。
- Computer Use 已检查重启后的真实 Nomi 与画布体验页、标题安全间距和形状菜单；未修改 Transformer。实际窗口截图：`.artifacts/canvas-tools-live-20261106.png`；隔离浅深色 / 窄屏截图：`.artifacts/notes-canvas/run-EqPkCE/`。
