# 架构总览

Nomi / 知己是个人一站式工作台，覆盖学习、笔记、信息 hub、知识、健康与财富管理，并可扩展到家庭成员。总体产品范围见 [个人工作台规格](product-specs/personal-workbench.md)。当前产品以 Electron 文稿 / 画布工作台为起点，独立个人同步后端 v1 已实现、完成隔离验证并部署至 amoylab；旧家庭资料 beta 已退役。

## 桌面 0.1.0 边界

当前桌面仅 Canvas / 文稿与设置；`apps/cli` 只保留未来同步边界说明，金融 UI / Data IPC / Go 服务已删除。文稿写入由 Electron host / `.nomi` 包承担，不需要独立常驻进程。未来云端备份 / 同步应使用版本化 IPC 和显式权限，不恢复旧金融服务。ChatGPT 登录 / provider 保留，Codex CLI 不随桌面分发。正式包和 Sparkle 原生桥见 [桌面发布](DESKTOP_RELEASE.md)。

## 代码结构

- `apps/desktop/`：Electron main、sandboxed preload 与本地工作台入口。
- `apps/web/`：Vite / React renderer，也可提供本地浏览器预览。
- `packages/ui/`：共享界面、桌面外壳、导航、主题、设置与页面。
- `packages/core/`：与 UI / host 无关的领域契约，以及平台中立的交互 IR 校验、求值与状态动作。
- `packages/interactive-native/`：独立 Foundation / Swift 参考解释器与同源 conformance，不是已接入的移动端 renderer。
- `packages/platform/`：浏览器存储及 allowlisted host 能力适配。
- `packages/host/`：Node-only 的文稿包、目录事务、凭据与 ChatGPT OAuth 适配；不进入 renderer bundle。
- `apps/cli/`：仅保留未来服务边界说明，不构建或运行。
- `apps/mcp/`：本机 stdio MCP 适配器，复用桌面文稿会话与领域操作；28 个文稿 / 内容块工具，显式开启，见 [本机 MCP](design-docs/local-mcp.md)。
- `apps/sync-server/`：独立 Go 个人同步后端；不依赖旧家庭服务。

## 桌面运行拓扑

`apps/desktop` / `apps/web` 组合共享 UI；UI 依赖 core 和 platform，core 不依赖 React / Electron。renderer 无 Node 或任意 filesystem 权限；Electron top-frame IPC 只允许声明过的方法。

Node host 管理 `.nomi` 包、原件、目录切换、保存事务和 ChatGPT 注册 / 会话。桌面不启动 Go 数据服务，不携带 SQLite 研究库或 Codex CLI；可显式开启本机文稿 MCP，适配器随桌面构建携带。主导航只有 Canvas 和文稿，Settings 保留目录、外观、ChatGPT 连接和 Sparkle 更新。交互学习通过文稿 / 画布内容块提供。正式发布见 `docs/DESKTOP_RELEASE.md`，运行与数据路径见 `docs/DESKTOP.md`。

## 个人同步与跨端边界

2026-11-15 的 [个人文稿云同步 v1](design-docs/cloud-sync.md) 收敛了同步范围：默认关闭，未登录保持本地使用；正文 / DSL / 画布与同步版本存 PostgreSQL，附件以引用关联 ObjectStore，开发先使用服务器持久 disk。按 block 乐观并发检查，同块冲突保留双方；首版不采用 CRDT / Node 协作房间、Redis 或实时多人编辑。上传调度与有界历史规则以该文档为准，[开发计划](exec-plans/completed/20261115-personal-cloud-sync.md) 按内核、附件、桌面、恢复和试用推进。独立后端、原件传输、桌面可选同步、分组冲突、有界历史 / 恢复与配对灾备均已通过本机隔离验证；后端已部署 amoylab，桌面同步已随 0.4.0 于 2026-11-16 发布。运行边界见 [同步实现](design-docs/cloud-sync-runtime.md)。

笔记与无限画布以平台中立 DSL / 语义模型为契约：Note / Block 表达长文、图片、文件、手写及 InteractiveBlock，Placement 独立表达空间展示。交互块包含状态、类型化计算、组件视图与动作；Electron 可先用 React / TypeScript，未来 SwiftUI / UIKit、Compose renderer 可独立实现，不要求移动端必须运行 WebView 或 JavaScript。DSL 快照、协作历史、个人学习状态有明确边界，不设两份可相互覆盖的主状态。

交互 IR、React 温度探索器、本机独立进度与 Swift 计算参考已实现，见 [运行时说明](design-docs/interactive-learning-runtime.md)。新增 Document / Note / Block / Placement / Connector 本地内核和画布编辑器，支持基础 shape、对齐吸附与摆放端点绑定，桌面结构与附件原件在可配置目录内以 `.nomi` 文件包保存（Markdown / GenUI 源、原件及 children 子包），完整工作区投影用于恢复；浏览器使用 IndexedDB；桌面文稿层级与实际文件夹双向联动，camera / study state 单独保存，见 [画布实现](design-docs/canvas-workspace-runtime.md)。个人同步 v1 已接入，原生手机同步适配、笔迹与对外 DSL 包规范仍待开发，不能混同金融 SQLite 或家庭 workspace。推荐的存储、鉴权、同步房间和手写实验见 [整体设计](design-docs/notes-infinite-canvas.md)；文档语法与往返约束见 [DSL 草案](design-docs/notes-canvas-dsl.md)。GenUI、OpenUI 复用评估、跨语言测试与温度探索器的实施顺序以 [交互内容修订](design-docs/generative-interactive-content.md) 为准。

2026-11-09 的 [交互块 v2 提案](design-docs/interactive-content-v2.md) 明确同一 DSL 共享状态、计算和交互语义，各平台分别适配布局、控件与动效。portable draft-2 已实现文本输入、数据表格、纯计算、语义图形与流式节点预览；Web 扩展及安全回退仍在设计中；HTML / JS、anime.js / Three.js 隔离执行尚未实现，不改变当前禁止执行生成代码的边界。

## 个人同步后端

旧家庭资料 Go server、iOS beta、Swift macOS 客户端和 amoylab 自动部署入口于 2026-11-15 按用户要求退出当前代码树。历史说明仅作追溯，不是当前运行拓扑；此次不删除远端服务或生产数据。

独立后端位于 `apps/sync-server`，按 [云同步设计](design-docs/cloud-sync.md) 实施，使用新数据库与设备会话。正文 / DSL / 画布和版本存 PostgreSQL，原件通过 ObjectStore（开发为持久 disk）存储。桌面不开同步无需登录；详见 [执行计划](exec-plans/completed/20261115-personal-cloud-sync.md)。

### 文稿写作视图

Canvas 上方的「文稿」复用同一 CanvasDocument / Note / Block 与平台存储（桌面文件目录 / 浏览器 IndexedDB），富文本只是 Markdown 的编辑投影，交互仍通过严格 DSL 与现有 renderer 执行。文稿提供富文本写作、内容块、可双击编辑的内嵌 Canvas、粘贴自适应、折叠目录、文稿作为父节点的子页导航与可调宽侧栏。内嵌画布使用独立场景和同一个 CanvasWorkspace，事务回到父文稿会话，正文按内容范围自适应预览；不与全局 board 混写。模式切换、导入和导出入口已移除，底层导出契约仍在 core / platform 保留并单独验证。详见 [文稿实现](design-docs/notes-authoring.md)。

### Canvas AI 生成

Canvas AI 入口复用 ChatGPT 订阅 provider，固定 host 提示生成受限新增 DSL，完整命令逐条校验后在画布临时层流式显示，最终整包校验后原子插入并支持撤销；Canvas 模式不读取现有内容。文稿 AI 在显式调用时携带标题、选区及前后各 1500 字符，使用独立提示词生成原生交互块与简短说明，拒绝静态图替代交互；输入框就地展开后停靠右上角，携带最近成功结果继续调整，仅原子替换本会话生成且未被手动修改的块组。不读取其他文稿、附件或执行生成代码。能力边界与验证见 [画布 AI 生成](design-docs/canvas-ai-generation.md)。

### 本机文稿 MCP

MCP / 未来 CLI 共用版本化领域操作，当前 stdio 适配器经私有 loopback 桥接现有编辑会话，修改进入同一个 Undo 与 `.nomi` 保存事务。全库版本、快照身份与幂等键防止覆盖用户后续输入；回收站与 Agent 修改记录按资料库持久保存。读取 / 导入 / 导出 / 反向链接等 28 个工具及边界见 [本机 MCP](design-docs/local-mcp.md)。不接入家庭 server，不执行任意生成代码。
