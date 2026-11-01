## [2026-10-31 23:00] | Task: 跨页面返回保留文稿选择

### 用户诉求

从文稿切到 Canvas 再回来，应继续之前选中的笔记，而不是打开第一篇。

### 改动与原因

文稿组件离开时卸载，侧栏入口不含 note 参数，原本只能回退到首篇。现在将实际显示的文稿 ID 作为本机 profile 的视图偏好保存，无参数入口恢复该选择；显式链接及前进 / 后退仍优先。离开文稿的 hashchange 不再重置选择，异步资料加载完成前不覆盖记忆，失效 ID 回退至现有首篇，空库清理偏好。不改正文或 revision，不占用撤销历史。

### 关键文件

- `packages/ui/src/pages/Notes.tsx`
- `scripts/check-notes.mjs`
- `docs/design-docs/notes-authoring.md`、质量记录、发布说明。

### 验证

- 类型检查、生产构建、完整 Notes Electron 回归与基础 CI 通过。
- 新回归覆盖侧栏 Canvas / 文稿往返、指定 ID 优先、前进 / 后退、失效 ID 回退、导航不改变 revision，以及刷新后恢复最后文稿。
- 确认保存后正常退出并重启正式 Nomi，Computer Use 选择原有文稿、进入 Canvas、点击文稿返回，选中行和正文标题均保留；未修改用户正文，保持原列表宽度与目录偏好。
- 截图：`docs/generated/verification/nomi-note-selection-return-live-2026-10-31.png`。
- 保留既有未提交修改，未提交推送。
