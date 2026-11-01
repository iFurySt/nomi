## [2026-10-31 22:45] | Task: 未固定目录不挤动正文

### 用户诉求

目录短线出现和展开时不应推移正文，只有 Pin 固定目录后才改变正文布局。

### 改动与原因

- 未固定目录原本额外占据 40px 栅格列，第一条标题出现时正文因此右移；现在目录列默认为 0，仅实际固定时启用自适应列。
- 保留左侧短线与浮层的绝对定位，使用正文既有留白；固定目录继续占据独立列，窄屏继续使用浮层。
- Notes Electron 回归记录无目录时的标题 / 正文坐标与宽度，验证首个标题出现、悬停展开、取消固定、收起与切到无目录文稿均保持不变；固定时确实留出空间，窄屏也无额外栏宽。
- 同步文稿设计契约、质量记录及发布说明。

### 关键文件

- `packages/ui/src/writing/writing.css`
- `scripts/check-notes.mjs`
- `docs/design-docs/notes-authoring.md`

### 验证

- 生产构建、完整 `pnpm smoke:notes`、基础 CI 与 diff 检查通过。
- 首次完整回归在无关的原生文稿列表拖宽阶段超时，独立重跑通过；本次目录几何断言两次均通过。
- 确认正式 App 已保存后正常退出、启动最新构建；Computer Use 比对收起 / 展开截图，正文保持原位，固定后正常留出空间。
- 截图：`docs/generated/verification/nomi-outline-overlay-collapsed-live-2026-10-31.png`、`nomi-outline-overlay-expanded-live-2026-10-31.png`、`nomi-outline-pinned-live-2026-10-31.png`（同目录）。
- 恢复原文稿、目录固定状态与列表宽度，未修改正文，未提交推送。
