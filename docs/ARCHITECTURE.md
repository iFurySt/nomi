# 架构总览

Nomi / 知己是个人一站式工作台，覆盖学习、笔记、信息 hub、知识、健康与财富管理，并可扩展到家庭成员。总体产品范围见 [个人工作台规格](product-specs/personal-workbench.md)。当前有两条独立运行路径：迁入的本地 Electron 工作台，以及已有的 iOS / server 家庭资料 beta；尚未实现统一账号、跨端同步或所有领域模块。

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
- `apps/ios/`：原生 SwiftUI iPhone App，现有家庭资料 beta。
- `apps/server/`：Go API、Postgres、FS storage、household workspace 与异步 worker。
- `infra/amoylab/`：现有 server 生产部署。

## 桌面运行拓扑

`apps/desktop` / `apps/web` 组合共享 UI；UI 依赖 core 和 platform，core 不依赖 React / Electron。renderer 无 Node 或任意 filesystem 权限；Electron top-frame IPC 只允许声明过的方法。

Node host 管理 `.nomi` 包、原件、目录切换、保存事务和 ChatGPT 注册 / 会话。桌面不启动 Go 数据服务，不携带 SQLite 研究库、MCP 或 Codex CLI。主导航只有 Canvas 和文稿，Settings 保留目录、外观、ChatGPT 连接和 Sparkle 更新。交互学习通过文稿 / 画布内容块提供。正式发布见 `docs/DESKTOP_RELEASE.md`，运行与数据路径见 `docs/DESKTOP.md`。

## 下一阶段目标架构（提案）

笔记与无限画布以平台中立 DSL / 语义模型为契约：Note / Block 表达长文、图片、文件、手写及 InteractiveBlock，Placement 独立表达空间展示。交互块包含状态、类型化计算、组件视图与动作；Electron 可先用 React / TypeScript，未来 SwiftUI / UIKit、Compose renderer 可独立实现，不要求移动端必须运行 WebView 或 JavaScript。DSL 快照、协作历史、个人学习状态有明确边界，不设两份可相互覆盖的主状态。

交互 IR、React 温度探索器、本机独立进度与 Swift 计算参考已实现，见 [运行时说明](design-docs/interactive-learning-runtime.md)。新增 Document / Note / Block / Placement / Connector 本地内核和画布编辑器，支持基础 shape、对齐吸附与摆放端点绑定，桌面结构与附件原件在可配置目录内以 `.nomi` 文件包保存（Markdown / GenUI 源、原件及 children 子包），完整工作区投影用于恢复；浏览器使用 IndexedDB；桌面文稿层级与实际文件夹双向联动，camera / study state 单独保存，见 [画布实现](design-docs/canvas-workspace-runtime.md)。这仍是单机实现，笔迹、跨端同步与对外 DSL 包规范仍待开发，不能混同金融 SQLite 或家庭 workspace。推荐的存储、鉴权、同步房间和手写实验见 [整体设计](design-docs/notes-infinite-canvas.md)；文档语法与往返约束见 [DSL 草案](design-docs/notes-canvas-dsl.md)。GenUI、OpenUI 复用评估、跨语言测试与温度探索器的实施顺序以 [交互内容修订](design-docs/generative-interactive-content.md) 为准。

## 家庭资料服务边界

以下描述当前已运行的 iOS / server beta，不代表个人工作台所有领域的最终数据模型。旧 `/records`、`/ask`、`/ai/extract-image` 与旧 Swift macOS 客户端不兼容；新的 Electron 工作台是独立实现。

## iOS / server 运行拓扑

1. iOS 通过 HTTPS 登录并持有 Keychain 中的 opaque session token。
2. 所有 `/v1/*` 请求先经过顶层会话认证，再按 session 中的 `household_id` 隔离查询。
3. 上传文件写入 `StorageProvider`；当前实现为本地 FS，接口允许未来替换 S3 兼容 OSS。
4. Postgres 保存 user、household、membership、session、invite、person、asset、job、knowledge projection、thread 和 message。
5. 单 worker 从 Postgres 以 `FOR UPDATE SKIP LOCKED` claim job，保证重启可恢复。
6. 每个 household 拥有独立 workspace。Go 确定性地归档原件、写入 `ai-vault` 摘要并提交 git；Codex 只读取目标资料和紧凑既有上下文，返回结构化分析。完成的分析同时 upsert 到 `knowledge_entries`，供移动端快速读取，filesystem 仍是真相源。
7. amoylab 宿主机的 `seedx daemon connect` 主动连接 `/daemon/connect`，使用宿主机 Codex 登录态执行 household cwd 中的任务。
8. 对话 job 读取 thread 历史和 workspace，生成带相对路径 citations 的 assistant message。

## 真相源边界

| 数据 | 真相源 | 说明 |
| --- | --- | --- |
| 原始资料、长期摘要、分析文档 | household filesystem workspace | 版本化、可审计、可由 Agent 读取 |
| 原始上传对象 | StorageProvider | 当前 FS；与 workspace 归档副本分离 |
| 身份、权限、队列、会话、App 资料列表投影 | Postgres | `knowledge_entries` 由 workspace 内容投影；每个查询必须带 household scope |
| 对话展示 | Postgres messages | assistant message 保留 workspace citations |

workspace 基本结构：

```text
workspaces/<household-id>/
  AGENTS.md
  docs/
  raw-data/
    _incoming/       # 临时、git ignored
    family/
    people/<person-id>/
  ai-vault/
    family/
    people/<person-id>/
  .git/
```

## API 边界

- Public：`GET /health`、`GET /privacy`、`GET /support`、`POST /auth/register`、`POST /auth/login`。
- Machine：`GET /daemon/connect`、带 HMAC 的 `GET /agent/assets/{id}`。
- User protected：全部 `/v1/*`，包含 logout、invite、people、assets、jobs、knowledge、threads 和 messages。
- 新增任何 `/v1` 路由时，即使忘记单独挂 middleware，也会先被顶层认证包拦截。

## 当前约束

- private beta 只允许创建一个 bootstrap household；owner 后续发一次性邀请。
- Apple Beta App Review 使用运维 CLI 创建的独立演示 household，不加入也不能读取真实家庭。
- 第一版单 worker 串行执行，避免 workspace 冲突。
- SeedX 0.2.1 daemon 对单次命令有 60 秒内部上限；生产默认 Codex effort 为 `low`，Nomi 把确定性文件操作移出 Agent 临界区。扩大使用前应由 SeedX 暴露独立 command timeout。
- 当前 Codex 登录态只允许服务受信任家庭，不作为公开 SaaS 凭据模型。

## 个人与家庭的后续边界

现有 beta 的 household 是共享权限边界，owner / member 默认可见全部家庭资料。个人工作台的私有内容不能默认进入这个共享空间；后续接入学习、笔记、财富与跨端同步前，需要明确独立个人归属、授权与共享语义。

### 文稿写作视图

Canvas 上方的「文稿」复用同一 CanvasDocument / Note / Block 与平台存储（桌面文件目录 / 浏览器 IndexedDB），富文本只是 Markdown 的编辑投影，交互仍通过严格 DSL 与现有 renderer 执行。文稿提供富文本写作、内容块、可双击编辑的内嵌 Canvas、粘贴自适应、折叠目录、文稿作为父节点的子页导航与可调宽侧栏。内嵌画布使用独立场景和同一个 CanvasWorkspace，事务回到父文稿会话，正文按内容范围自适应预览；不与全局 board 混写。模式切换、导入和导出入口已移除，底层导出契约仍在 core / platform 保留并单独验证。详见 [文稿实现](design-docs/notes-authoring.md)。

### Canvas AI 生成

Canvas AI 入口复用 ChatGPT 订阅 provider，固定 host 提示生成受限新增 DSL，完整命令逐条校验后在画布临时层流式显示，最终整包校验后原子插入并支持撤销；不读取现有文稿或执行生成代码。能力边界与验证见 [画布 AI 生成](design-docs/canvas-ai-generation.md)。
