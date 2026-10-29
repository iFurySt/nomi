# 质量评分

评分：A=完整稳定；B=可用但有明确短板；C=能跑但需补强；D=脆弱或未定义。

| 区域 | 评分 | 当前证据 | 主要短板 |
| --- | --- | --- | --- |
| 产品 | C+ | 已确认个人一站式工作台与家庭扩展定位，并形成长笔记 / 无限画布 / GenUI / 平台中立 DSL 架构提案；已有家庭账号、成员 scope、上传分析和连续对话 mobile 闭环；生产 synthetic 双账号验证共享 people/assets/threads 与 owner-only invite；外测 Public Link 已按 10 人上限启用。 | 已有 Canvas / 长笔记 / 附件 / 交互学习本地切片；手写、跨端与通用信息 hub 未开发；桌面和 server 尚未统一；原 beta 缺密码找回、导出/彻底删除。 |
| 架构 | B | FS 原件/上下文与 PG 权限/队列/projection 边界明确；legacy AI 文档已投影为 household-scoped knowledge，StorageProvider 可替换。 | 桌面本地 SQLite 与家庭 server FS / PG 是独立路径，需设计个人归属与共享模型；server schema migration 仍缺正式工具。 |
| 桌面 | B- | AIFi Electron / React / Node / Go 基础已迁入并独立命名，采用 Nomi「知己相伴」独立图标与主题反转标志；类型检查、374 个单测、Go vet / race、生产构建和 ChatGPT / Codex / MCP 合成验证通过。 | 保留金融专用页面；Nomi 真实账号登录待用户授权；新增默认 Canvas、Note / Block / Placement、IndexedDB 原子保存、附件校验、Learn 与独立进度；36 个画布内核 / 附件 / 连接与几何测试与 3 个体验样例测试（类型、复用、幂等和 PDF 原件），并验证真实 App 中 11 项样例、公式行数、定位和刷新恢复，以及双击原位编辑 / 退出渲染 / 放大连续性、顶部可选标题和八方向缩放 / 取消 / 刷新恢复；新增内容上层的四角选框、选中态四侧圆点直接拖线、边界锚点吸附与连线浮动工具栏 / 样式 / 文字 / 剪贴板 / 锁定 / 线段拖动、方向 cursor、吸附 / Alt / Shift、形状、连接 / 改接 / 标签 / 样式 / 删除关联撤销和浅深色截图，加上此前 30 个交互内核 / 存储测试、实际 App 的 Electron 交互回归和 Swift 18,500 数值比较；新增 26 种语义形状、形状 / 多选属性栏、框选 / 分组 / 统一缩放、等距 / 等尺寸辅助线、独立副本与内部绑定，详见选择与布局矩阵；仍缺跨端同步、原生 UI、桌面分发与完整 CI，Workspace 手势协调仍需拆分。 |
| iOS | B | 登录、邀请注册、家庭成员、上传、资料知识列表和 chat 已编译；真实生产账号 authenticated XCUITest 已验证 81 条 legacy knowledge 可加载、无 alert，且资料/对话/家庭三页可进入；`0.1 (7)` 已在内部/外部组可用并获 `BETA_APPROVED`。 | 真实家庭真机资料/对话体验待用户确认；还需要更多异常态自动化。 |
| 后端 | B | `/v1` 默认鉴权、tenant scoped CRUD/knowledge、持久 job queue、幂等 legacy importer、workspace git 和 SeedX/Codex 均已实现。 | 缺速率限制、审计表、retry API 与完整删除语义。 |
| Agent | B | 真实 ingest 37.8 秒、chat 45.8 秒完成，归档/摘要/commit/citations 均有实证。 | SeedX 0.2.1 daemon 的 60 秒硬上限需上游配置化。 |
| 测试 | B | Go 单测、鉴权默认拒绝、storage traversal、workspace finalization、Swift build 与 auth UI test。 | 缺自动 Postgres 集成测试和 CI 中的真实 SeedX smoke。 |
| 部署 | B | `server-v0.2.5` 已部署且 healthy；真实家庭的 565 个 workspace 文件与 81 条 knowledge 经幂等、隔离、JSON contract 和 authenticated UI 验证，修正前另留 PG dump。 | 需要做周期化备份和完整恢复演练。 |
| 安全 | B- | bcrypt、hashed opaque sessions、single household bootstrap、一次性邀请、tenant isolation、Keychain。 | 缺 rate limit、邮箱验证、密码重置、设备会话和彻底删除。 |
| 可观测性 | C | 结构化 job 日志包含 id/kind/household/duration/error。 | 缺 metrics、traces、队列告警和 request id。 |

## 2026-10-25 文稿增量证据

代码 / 附件增量现有 63 文件 / 369 单测、类型检查、Notes / Canvas 回归、开发文件边界和生产构建证据。语法高亮与隔离剪贴板原文复制、无框图片说明的保存重开 / 导出、真实 PDF 像素 / 翻页 / 窄屏重绘及损坏 PDF 下载回退均通过；worker / CMaps / 标准字体随包本地加载。真实 App 重启后已核对既有 PDF 显示页码与预览控件，恢复用户当前文稿。

悬停属性菜单、公式就地输入 / 实时预览 / 三种对齐、灰色居中分割线与表格文本 / CSV 输出已实现。当前 61 文件 / 365 单测、类型检查、Notes Electron 回归和生产构建通过；回归包含前台原生公式输入焦点、对齐实际几何位置、保存重开 / Canvas / 离线预览、表格合并格与特殊字符转义、隔离剪贴板及真实 CSV 文件，浅深色 / 窄屏截图位于 verification。

新增 Canvas 下方的「文稿」本机写作页，Tiptap 富文本 / Markdown / 数学、同源内容块、附件、交互定义与 Markdown / Jekyll ZIP 导出。`smoke:notes` 覆盖实际 Electron 保存 / 恢复、公式与表格往返、模板原文保护及导出后的离线交互；`smoke:canvas` 全部通过。此能力仍为第一版：特殊 Markdown 使用源码、发布字段尚未持久化、任意 JS / Anime.js 注册和跨端协作未实现。契约见 [文稿编辑与文章导出](design-docs/notes-authoring.md)。

文稿反馈迭代新增停笔 700ms / 最长 3s 合并保存、稳定保存提示、关闭前等待写入、右键删除与撤销、统一格式工具栏和非文本前后连续输入。新增调度 / 删除引用 / 输入投影测试；文稿 Electron 回归确认连续输入只有一次 IDB 写入、首字不丢光标、删除目标与撤销正确、退出 flush 成功与失败路径。

文稿新增空段落粘贴与保存重开覆盖、类型属性菜单和块拖动；跨文字 / 实验移动使用原子文稿事务，统一撤销。Electron 回归使用真实鼠标启动拖动并验证落点，覆盖浅深色 / 窄屏菜单。

文稿上下文编辑迭代移除固定格式栏及底部工具条，空段加号替换插入，已有块保留属性与拖动；选区浮层支持样式、链接、行内公式与选区恢复，表格操作和放到画布收进块菜单。Notes Electron 回归补充空行类型替换、表格属性操作、Markdown 模式插入、选区样式及弹窗恢复、窄屏浅深色截图。

Notion v3 剪贴板空段恢复已接入：原生系统剪贴板隔离验证恢复 54 块 / 20 空段，脱敏回归覆盖格式保留、列表与空段位置、Markdown 往返 / 重开、未知格式回退。具体支持范围见文稿设计契约。

文稿浮层在同一选区的格式切换中保留锚点；gutter 扩大至左侧留白，拖拽落点覆盖整个文稿滚动面板。Electron 回归验证真实鼠标 gutter 命中、左右正文外落点线与 drop、浮层连续格式操作和滚动跟随。

列表按 item 独立拖动，结构内核覆盖跨列表和嵌套项移动、唯一项清理，文稿块拖动只显示一条落点线。361 单测和 Notes Electron 回归通过，包含真实鼠标原生 drop cursor 抑制、单项跨组移动与保存重开。

文稿界面遵循 less is more：移除重复历史按钮、模式切换、Markdown 文件导入及导出入口，保留单一富文本 / 自适应粘贴。表格增加轻边框与局部滚动，目录支持短线、悬停展开、实时标题、章节跟随 / 跳转和可固定侧栏。Notes 回归覆盖上述行为及浅深色 / 390px 布局，底层导出验证由独立 fixture 调用。

文稿聚焦框线已移除，列表 / 更多 / 标题按实际计算样式检查无 outline 与 box-shadow，选区浮层键盘聚焦统一使用底色反馈。

正文留白可继续输入：原生鼠标点击下方 / 列外空白定位末尾，验证不新增空段或 revision，原生输入直接追加；既有文稿回归通过。

待办交互节点补齐 taskItem 类型标记，回归验证勾选框与首行同行、勾选可用；目录收起 / 固定 / 窄屏全部位于正文左侧，预留短线栏避免覆盖块拖动柄，截图已更新。

## 2026-10-27 实际写作增量证据

通过 Computer Use 在真实 Nomi 创建独立长文与图片附件文稿，实际编辑 Markdown、嵌套列表、待办、表格、公式与图片说明，验证上移 / 撤销 / 重做、大图、目录及重启保存。修复标题 Enter 跳转、新建文稿残留搜索、列表 / 短片段留白、小图放大及按钮底色、中间编辑撤销丢光标、粘贴与快速输入合并撤销。374 单测、类型检查、生产构建、完整 Notes / Canvas Electron 回归与基础 CI 通过；新增原生撤销 / 重做选区与继续输入回归，此前 Notes 安静输入 / 空行菜单阶段已在本轮完整流程通过。真实窗口截图见 verification 的 writing-dogfood 文件。
