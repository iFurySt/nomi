## 2026-11-07 14:36 | Task: 收敛文稿目录布局与固定状态

### Execution Context

- Agent ID: /root
- Runtime: Codex desktop

### User Query

> 固定目录用实心大头针、未悬停隐藏；目录使用正文左侧留白，正文两侧间距一致；当前章节仅文字加深，无背景。

### Changes Overview

- 目录始终脱离正文布局，根据实际左侧留白调整宽度，保留块工具柄空间；空间不足暂时恢复紧凑入口，宽度恢复后保留固定偏好。
- 正文对称内边距；固定图标复用 Pin 的填充态，悬停或键盘聚焦可见。当前章节移除背景，固定目录长标题可换行。
- 修复最后一节过短、滚到底仍高亮上一节的边界。
- 更新正文目录文档、UIUX 约定及回归脚本。

### Files Modified

- packages/ui/src/writing/WritingOutline.tsx
- packages/ui/src/writing/writing.css
- scripts/check-outline.mjs
- scripts/fixtures/outline.tsx
- scripts/check-notes.mjs
- docs/design-docs/notes-authoring.md
- docs/UIUX_REFERENCE.md
- docs/QUALITY_SCORE.md

### Validation

- pnpm check、pnpm build 通过。
- node scripts/check-outline.mjs 通过：对称留白、固定切换坐标不变、图钉显示与填充、章节跳转、深色、窄屏、390px 无溢出，截图已检查。
- pnpm smoke:notes 的目录 / 表格阶段通过；后续原有侧栏宽度拖动保存断言超时，未声称全量通过。
- 重启 Nomi(Dev)，在开发版示例文稿中实际检查固定目录；不操作正式版和用户文稿。
