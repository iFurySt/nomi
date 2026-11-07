## [2026-11-07 16:12] | Task: 统一交互块产品命名

### User Query

检查 AGENTS.md、docs 和代码，将通用内容类型统一命名为「交互块」。

### Changes

- 文稿、画布的插入菜单、类型标签、选择弹窗、内置示例和导出文案统一使用「交互块」；同步 UI 回归脚本的菜单名称。
- 斜杠菜单增加 `jiaohu` / `jiaohukuai` 别名，保留 `experiment` / 「实验」搜索兼容。
- 当前设计与产品文档统一命名，在 GenUI 设计文档明确用途边界，并由 AGENTS.md 导航到该约定。
- AI 提示使用 interactive content 表达支持的交互内容，不限定为实验。
- 保留历史发布记录、已完成计划与 history 的原始称呼；具体 Softmax 温度实验仍可叫实验。内部类型、操作标识和持久化格式不变，不修改用户既有文稿。

### Validation

- `pnpm check` 通过。
- `pnpm exec vitest run packages/core/src/canvas/note-export.test.ts`：5 项通过。
- `git diff --check` 通过；当前代码中的旧中文类型名已清理。
- 本次为并行侧聊的局部文案修改，为避免干扰主会话的开发版验收，没有重建共享产物或重启 App；实际界面待下次开发版构建加载。
