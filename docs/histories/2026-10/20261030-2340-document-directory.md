## [2026-10-30 23:40] | Task: General 与真实文稿保存目录

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop，Electron / TypeScript，本地文件与 Computer Use 验收。

### User Query

设置在 Appearance 前增加 General，可选择文稿保存目录，默认系统 Documents/Nomi，按实际位置保存。

### Changes

- General 默认入口、真实路径按钮、原生目录选择器，紧凑行样式、完整路径提示与窄屏纵排。
- 新增 host DocumentStore 和主 frame allowlisted IPC。DSL 快照与不可变原件落盘，校验摘要 / 长度 / revision，临时文件 fsync + rename 提交，串行保存与目录切换。
- 旧 IndexedDB 按 profile 首次访问迁移，保留旧库，磁盘为唯一正文来源；浏览器继续现有 IndexedDB。
- 更换到空目录复制所有已迁移 profile，成功后持久切换；取消 / 非空目标 / 校验或配置失败不变更，旧目录保留副本。
- 同步架构、Desktop、文稿 / 画布、设置基线、质量与发布记录。保留上一轮尚未提交的文稿树变更。

### Intent / Boundary

文稿和画布共享一个完整语义工作区，不能只迁移 Markdown 而丢掉附件、子页、连线和交互。目录当前包含可读 DSL 快照和附件，文稿树由 Note 关系管理；不自动映射 Finder 文件夹、无 watcher / 外部编辑合并 / 跨端同步。旧附件保留支持撤销，GC 未实现。

### Verification

- 类型检查、67 文件 / 403 单测、生产构建、桌面 smoke 通过。
- 新增真实临时目录 8 项单测：原件、隔离、版本冲突、迁移、失败回滚与 symlink。
- `smoke:document-directory` 通过真实 preload / IPC / host / React 的迁移、编辑、附件、取消、切换、刷新、浅深色与窄窗口检查。首次脚本刷新保留 settings hash 导致等待错误，改为显式导航；深色截屏等待真实主题切换完成，并修复测试脚本字符串转义。未放宽产品断言。
- 截图发现窄屏说明被长路径挤压，改为上下布局后再次截图确认。
- 补跑完整 Notes 回归两次：正文 / 附件 / 保存 / 导出阶段均通过，分别在既有层级菜单合成 pointer 与拖宽持久化阶段超时。第二次通过首次失败的菜单阶段；未修改这些无关产品逻辑或放宽断言，完整 Notes 本轮不记为通过。
- Computer Use 正常退出旧版本、启动新构建，确认既有文稿和已保存状态、318px 侧栏宽度；系统目录选择器取消不改路径，路径按钮在 Finder 打开实际目录。6 个已有附件字节长度和 SHA-256 校验全部一致。实际 General 截图见 verification。

### Key Files

- `packages/host/src/document-store.ts`
- `apps/desktop/src/document-ipc.ts`
- `packages/platform/src/canvas.ts`
- `packages/ui/src/pages/GeneralSettings.tsx`
- `scripts/check-document-directory.mjs`
- `docs/design-docs/document-directory.md`

### 2026-10-31 补充：Finder 层级对应文稿树

- 用户明确选择 Finder 文件夹层级直接对应左侧文稿树，替代上轮仅快照落盘的结构边界。
- 每篇文稿使用同名目录和隐藏身份 metadata，实际嵌套决定父子关系；非法文件名和重复标题有安全映射，正文仍为完整工作区 DSL。
- App 结构操作可恢复地发布目录树，保留旧树与完整旧快照；Finder 新建 / 改名 / 移动 / 删除读回，新增目录生成可编辑空文稿。
- 前台轮询及聚焦刷新；并发修改不覆盖，提供备份本地草稿和附件后读取磁盘版本。目录迁移携带树和恢复资料。
- 新增 `note-directory-tree.ts`、9 项真实目录测试，扩充 Electron 回归验证真实侧栏层级、空文稿编辑、冲突备份与重读。
- 类型检查、生产构建和仓库规定范围的 68 文件 / 412 单测通过。第一次无范围 Vitest 调用误扫描本机 macOS 构建制品中的第三方测试，改用仓库 `pnpm test --maxWorkers=2` 后通过；未改变测试断言。
- 最终 `smoke:document-directory`、`make ci` 和 `git diff --check` 通过；Electron 截图见 `docs/generated/verification/nomi-finder-tree-2026-10-31.png`。
- 解锁后通过 Computer Use 正常退出旧版本并启动最新构建。确认原有 17 篇文稿、318px 侧栏及保存状态；Finder 实际打开父文稿目录，显示对应三篇子文稿。Finder 临时改名体验子文稿，App 自动读取；再由 App 恢复原标题，Finder 同步恢复。General 显示真实默认路径与层级联动说明，已置于前台供用户体验。截图见 `nomi-finder-sync-live-2026-10-31.png`、`nomi-finder-folders-live-2026-10-31.png` 与 `nomi-general-tree-live-2026-10-31.png`。

### 2026-10-31 设计补充：.nomi 目录文件包

- 用户要求评估类似 `.app` 的目录文件包，避免日常压缩与二进制内嵌，同时让 AI 直接编辑 DSL 与资产。
- 新增 `docs/design-docs/nomi-document-package.md`，推荐自包含目录包、JSON 结构 / Markdown 原文 / GenUI IR / 原件及嵌套子包；明确 Finder 默认隐藏内部层级的取舍。
- 设计外部编辑验证、冲突与多文件提交边界、唯一内容所有者 / 画布跨包引用、复制身份、原位打开、Apple 类型注册 / 文件协调及跨端限制。基于 Apple 与 Electron 官方文档核对机制。
- 同步当前存储说明、历史 DSL 草案与设计索引，均标明提案未实施。未修改运行代码、未迁移数据，也不将格式提案当作已通过的 App 能力。
