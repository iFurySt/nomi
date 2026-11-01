# Electron 桌面工作台

## 来源与迁入范围

2026-10-18 从 AIFi 当日工作区迁入，包括未提交的最新源码。基于源 commit `1e1beb5beca79e30d5f87ee0bae5d934c45f65f1`，并非该 commit 的纯快照。来源及许可见根目录 `NOTICE` / `LICENSE.aifi`。

迁入 `apps/desktop`、`apps/web`、`apps/cli`、`packages/{ui,core,platform,host}`、必要运行与 smoke 脚本、依赖 lockfile、Codex 第三方声明和 [桌面设计基线](design-docs/desktop-design.md)。0.1.0 已删除迁入的金融页面、Data 设置、Go 数据 / MCP 服务及 bundled Codex CLI，仅保留 Canvas、文稿、主题、General 和 ChatGPT 连接。

源码迁入未包含源仓库的登录态、ChatGPT profiles、个人研究资料、SQLite、环境配置、Git 元数据、node_modules 或构建产物。本机验证时 npm registry 超时，离线安装后仅为补齐缺失的可选依赖，复用了本机 AIFi 已安装的精确版本 Codex ARM64 npm 平台包；它只位于 ignored node_modules，不进入版本管理。Electron 由本机包管理器下载缓存解压。品牌名称与图形均已换成 Nomi；桌面采用用户选定的 B「知己相伴」黑底白标，界面 CSS mask 随主题反转。母版与各平台导出见 `packages/ui/src/assets/brand/nomi-companion-v1/README.md`；原生 iOS 图标尚未替换。

## 运行与检查

依赖 Node.js 24+、pnpm 10+；桌面不再依赖 Go。正式 DMG 构建另需 macOS 与 Xcode 工具，见 [桌面发布](DESKTOP_RELEASE.md)。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm desktop

# 热更新桌面 / 浏览器预览（默认 loopback 5173，启动前确认未占用）
pnpm dev:desktop
pnpm dev

# 回归验证
pnpm check
pnpm test
pnpm smoke:desktop # 包含 Canvas / 文稿 / 侧栏折叠 / 存储恢复回归
pnpm smoke:canvas # 单独验证画布、长笔记、原件与错误路径
pnpm smoke:document-directory # 真实文件迁移、目录切换、附件与设置回归
pnpm smoke:notes # 富文本、表格、目录、粘贴、附件与底层离线契约
pnpm check:interactive-native # 需要 swiftc；同源 DSL 语义验证
make ci
```

`pnpm build` 仅构建 Web renderer 和 Node main/preload。macOS launcher 生成本地 ad-hoc 签名的 `apps/desktop/dist/Nomi.app`，可用 `pnpm desktop` 启动；它不是可分发的 notarized release。

`pnpm smoke:desktop` 使用临时 Electron profile 和空本地 store，随后运行合成交互检查；不会读取正常账号。其他 UI smoke 的合成产物位于 git ignored `.artifacts/`。真实 ChatGPT 登录和实际推理需要独立人工授权验证，合成 smoke 不代表在 Nomi 中已经完成真实账号登录。

## 数据与身份

- Electron 展示名 `Nomi`，本地 macOS bundle id `com.ifuryst.nomi.local`，包命名空间 `@nomi/*`，preload `window.nomiDesktop`，IPC / localStorage 使用 Nomi namespace。
- Electron profile 由应用名确定；ChatGPT host 的数据目录默认是 macOS `~/Library/Application Support/nomi/data`、Windows `%APPDATA%/nomi/data`、Linux `${XDG_CONFIG_HOME:-~/.config}/nomi/data`，可用 `NOMI_DATA_DIR` 覆盖。
- 旧 SQLite / 数据源文件不会被清理代码删除，但 0.1.0 不再读取它们。ChatGPT 连接仍沿用原路径，不从 AIFi 自动迁移。
- ChatGPT 注册与可续期会话在 `chatgpt/profiles.enc`，密钥在相邻 `chatgpt/vault.key`，目录 0700、文件 0600。同一操作系统用户可读文件密钥，这是当前加密边界。
- 浏览器预览使用 IndexedDB，不启动本地数据服务；ChatGPT 登录仅在桌面可用。

## 文稿目录

Settings → General 位于 Appearance 上方，也是设置默认页。文稿、画布及附件默认保存到系统 Documents 下的 `Nomi/`（macOS 通常为 `~/Documents/Nomi/`）；点击路径打开系统文件管理器，「更改」通过原生目录选择器选择空目录。切换前等待文稿保存，完整复制受管理数据、校验后才原子切换配置；原位置保留副本。取消、非空目标、附件损坏、无法写入均不切换。

桌面使用文件作为正文真相源；浏览器预览继续 IndexedDB。已有本机 profile 在首次打开时把该 profile 的文档和所有引用原件迁入，旧 IndexedDB 保留作备份，此后不再双写。磁盘已有文档优先，损坏存储不回退成空文稿。迁移是本地操作，不关联 ChatGPT 凭据或家庭服务。

目录格式与限制见 [.nomi 文件包契约](design-docs/nomi-package-format.md)。目录偏好位于 Electron userData 的 `document-directory.json`；视口、学习参数和界面偏好仍是设备状态。默认工作区的 `文稿/` 下由 `.nomi/children/` 嵌套表达文稿树；Finder 改名、移动和合法文件包的新增会读回，空普通目录不自动成为文稿。外部变化刷新与冲突草稿备份见格式契约。

## ChatGPT 与 AI 路径

桌面账号菜单 → **Sign in with ChatGPT** 或 Settings → ChatGPT，在系统浏览器中完成 Nomi 自己的授权后返回。可管理多个账号、选择账号提供的模型与 reasoning effort；可用性取决于实际账号权限和服务响应，不保证所有账号都可用。

路径为 `React UI → allowlisted preload → ChatGPTHost`。保留 PKCE / state / nonce、回调验证、JWT 校验、刷新与撤销、加密存储及账号偏好；renderer 不拿 token。0.1.0 没有独立 Chat 页面和金融工具，不启动 Codex app-server。保留 provider 适配为未来文稿 AI 能力使用，不宣称已接通笔记或家庭资料。家庭 server 的 SeedX 路径独立。

## 正式发行

0.1.0 的独立 App、DMG、Sparkle 自动检查 / 手动检查、签名与公证流程见 [DESKTOP_RELEASE.md](DESKTOP_RELEASE.md)。工具栏折叠按钮控制文稿内侧列表，保持正文编辑器实例和选中文稿；宽度 / 折叠偏好保留。

## 笔记与无限画布方向

默认入口已落实为 Canvas，可在画布内写长笔记、贴图 / 文件、摆放交互学习块并本地恢复。新建文本默认无标题，标题在顶部直接填写 / 修改 / 清空；双击笔记原位编辑，点击外部或「完成」恢复渲染，放大图标进入弹窗实时预览。所有框支持四边和四角调整宽高并保存恢复，选中时只显示四个角点。工具栏提供形状、连接与吸附；选中对象即显示四边圆形连接点，可直接拖出箭头到另一对象，也可使用连接工具，选中线下方的浮动栏提供端点标记、颜色透明度、线型 / 粗细 / 路径、文字格式和复制 / 层级 / 锁定等菜单；靠近形状显示边界锚点吸附，端点可改接，中间线段可拖动。新增形状 / 多选属性栏、框选 / 组合 / 统一缩放、六种对齐 / 等距排列及移动等间距 / 缩放同尺寸参考线，详见 [选择与布局矩阵](design-docs/canvas-selection-and-layout.md) 和 [连线编辑](design-docs/connector-editing.md)。空白左键拖动框选、空格拖动平移。Alt 临时关闭吸附，Shift 拖动锁轴，方向键微移，置顶 / 置底和复制摆放继续使用同一命令内核。右上「体验样例」可追加 11 项可编辑 / 可下载内容（含三种形状和连线），左下逐项定位；不会重置已有内容。说明与边界见 [画布实现](design-docs/canvas-workspace-runtime.md)。交互 DSL 内核、React 学习工作区与 Swift 计算 conformance 已落地，运行 `pnpm desktop` 后在左侧 Learn 进入；细节见 [运行时说明](design-docs/interactive-learning-runtime.md)。可编辑笔迹、AI 生成、原生编辑与同步仍待实现，参见 [整体设计](design-docs/notes-infinite-canvas.md)。长期支持独立原生 renderer，WebView 是兼容选项；[交互内容修订](design-docs/generative-interactive-content.md) 明确 OpenUI 复用与平台边界。本轮新增 KaTeX 用于受限 LaTeX 渲染，Canvas 原位笔记仍用 textarea 编辑、Markdown / 数学插件预览；Canvas 下方新增「文稿」入口，使用单一富文本、公式、附件与可操作的 DSL 实验，并提供悬停 / 固定目录；Markdown 切换、导入和导出入口暂时移除，底层归档与离线契约保留。详见 [文稿写作与目录](design-docs/notes-authoring.md)。未接 OpenUI 生产依赖。

## 后续边界

完整学习流程 / 笔记 / 信息 hub 模块、跨领域知识模型、个人 / 家庭权限、server 对接和同步均另立计划。本次不删除成熟功能、不启动真实数据采集或 AI 推理、不改变生产服务。

## .nomi 文件包（2026-10-31）

文稿正文及原件现在保存在自包含 `.nomi` 目录包，子文稿在 `children/` 下，画布为同库 `画布.nomi`。既有快照 / 目录自动迁移并保留恢复资料；`workspaces` 是最后接受版本的投影，不再是唯一正文来源。Finder 类型、打开 / 导入和直接编辑规则以 [v1 实现契约](design-docs/nomi-package-format.md) 为准，长期设计见 [设计基线](design-docs/nomi-document-package.md)。

## 长文性能验证

`pnpm profile:notes` 使用生产模式 Electron 和独立合成库测长文 / 混排的打开、输入、滚动、撤销和保存，另测真实 `.nomi` 文件包读写。报告、CPU profile 与截图保留在 `.artifacts/notes-performance/`；不使用现有文稿。方法、结果和容量边界见 [长文与混排性能](design-docs/notes-performance.md)。

### 紧凑导航与更新入口（下一版本）

桌面外侧栏为 52px 纯图标导航，按钮 36px、导航图标 20px、品牌 / 头像 / 更新圆形入口 24px；Canvas / 文稿 / 搜索悬停和键盘聚焦显示名称。移动端保留带文字导航。

正式 App 发现更新后在头像上方显示蓝色下载按钮，点击才开始下载；圆环显示 Sparkle 的真实字节进度，解包时显示转圈。验证和准备完成后提示「稍后 / 重启并更新」。安装前保存所有文稿，保存失败会保留更新并允许重试。没有更新时隐藏入口，设置页显示检查结果。开发构建不连接更新源。
