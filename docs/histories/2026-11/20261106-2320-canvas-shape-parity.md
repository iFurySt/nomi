## 2026-11-06 | Task: 全形状绘制与布局实测

### User Query

> 所有形状的绘制、拖动对齐全部检查，对标飞书，结合 Computer Use 和 Browser Use。

### Changes

- 实际浏览器对照飞书的自由绘制、Shift 等比和移动边缘吸附；临时对象已清理，未复制第三方实现。
- Shift 拖绘约束正方形包围框；反向拖绘到尺寸限值仍固定起点；预览使用实际形状的坐标范围；绘制过程中增加边缘、中心和同尺寸辅助线，Alt 临时绕过。
- 等比缩放统一限值计算，保持宽高比例与固定对角。
- 修复非矩形内收轮廓上的外侧连接按钮侵入缩放热区；闲置圆点置于包围框外，连线过程中仍指向真实轮廓。
- 修复独立画布 Text 的 Esc 无法退出编辑、随后的对象撤销被输入框接走。
- 新增全枚举原生指针专项与几何边界单测，同步参考和设计说明。

### Validation

- `pnpm check`、`pnpm test`（44 文件 / 333 单测）、`pnpm build` 通过。
- `node scripts/check-canvas-shapes.mjs`：25 图形 + Text，四方向绘制、Shift、Esc、八方向缩放与 cursor、移动吸附、Alt、锁轴、Undo / Redo 全部通过；报告 / 单形状截图位于 `.artifacts/canvas-shapes/run-d8jpig/`。
- `node scripts/check-canvas.mjs` 与 `node scripts/check-notes-canvas.mjs` 通过，包含等距、同尺寸、多选、组合和绑定连线。
- 实际 App 已重启，Computer Use 在画布体验页验证平行四边形绘制、右侧缩放、边缘对齐、三次撤销；原画布恢复并显示已保存。Transformer 未修改。
- 对照与实际截图存于 `.artifacts/shape-audit/`。本次不提交、不发版。

### Files

- `packages/core/src/canvas/document.ts`、`gestures.test.ts`
- `packages/ui/src/pages/Canvas.tsx`
- `scripts/check-canvas-shapes.mjs`、`scripts/canvas-parity-checks.mjs`
- `docs/design-docs/canvas-selection-and-layout.md`、`docs/references/canvas-interactions.md`
