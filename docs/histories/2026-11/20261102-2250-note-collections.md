## 2026-11-02 | Task: 子文稿视图与正文文稿块

### User Query

> 子文稿列表布局太松散，希望有一行一篇的表格视图，以及类似 Notion 的文稿 block。

### Changes

- 修复图标 span 被通用 flex 规则拉伸的问题，复用紧凑左对齐文稿链接。
- 子文稿集合提供文稿块 / 表格视图，本机按文稿记忆，保持原有层级、排序与内容不变。
- 正文块菜单可搜索插入已有文稿，或原子新建子文稿并插入；共享拖动、移动、移出、撤销和重做。
- 新增 note-reference DSL，Canvas 共用渲染，缺失引用保留禁用占位；文件包与选区复制只映射本次范围内目标，离线导出不带入目标正文。
- 新类型需要新版客户端；旧客户端按既有未知类型规则拒绝写回。只切换集合视图不迁移正文。

### Validation

- 39 文件 / 290 单测通过，新增字段校验、删除引用目标、导出隔离、文件包往返与导入、复制引用映射覆盖。
- 类型检查、生产构建、基础 CI 与隔离 Electron 回归通过。
- 回归验证两种视图、固定图标宽度、偏好不增加 revision、窄屏、插入 / 上下移动 / 移出 / 撤销重做 / 重开 / 跳转 / 缺失目标及原子新建子文稿。
- 浅深色与窄屏截图已检查；合成示例截图见 `docs/generated/verification/nomi-note-collection-{blocks,table}-2026-11-02.png`。

- 实际 App 确认保存后退出并重启，Computer Use 验收 AI 页文稿块与表格切换，未编辑用户文稿。

### Main files

- `packages/ui/src/writing/NoteCollection.tsx`
- `packages/ui/src/writing/NoteLink.tsx`
- `packages/ui/src/writing/note-links.css`
- `packages/ui/src/pages/Notes.tsx`
- `packages/core/src/canvas/document.ts`
- `packages/host/src/document-store.ts`
- `scripts/check-note-collections.mjs`
