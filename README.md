# Nomi / 知己

Nomi 是个人一站式工作台：把学习、笔记、信息 hub、知识、健康与财富管理放在一个持续积累的个人空间里，用 AI 帮助整理、连接、查询和理解，并可按需扩展到家庭成员。

## 当前开发重点

下一阶段优先实现 **DSL 驱动的笔记、无限画布与交互学习 / GenUI**：完整长笔记支持 Markdown / LaTeX，混排图片、文件、手写与交互组件；同一语义协议支持未来的 Apple / Android 原生 renderer。默认桌面入口现在是 **Canvas**：可平移 / 缩放，创建和摆放长笔记、图片、文件与交互学习块，支持本地保存、聚焦编辑和文档 DSL。交互计算已有 TypeScript / Swift 一致性验证。手写、AI 生成、原生移动编辑和跨端同步仍待实现。见 [画布实现](docs/design-docs/canvas-workspace-runtime.md)、[交互运行时](docs/design-docs/interactive-learning-runtime.md)、[整体设计](docs/design-docs/notes-infinite-canvas.md)、[DSL 草案](docs/design-docs/notes-canvas-dsl.md)、[GenUI 修订](docs/design-docs/generative-interactive-content.md) 和 [格式示例](docs/design-docs/notes-canvas-example/README.md)。

## 当前状态

- **Electron 桌面 0.1.0**：Canvas 与文稿，支持 Markdown / LaTeX、图片、文件、表格、交互内容与 `.nomi` 文件包。macOS DMG 和 Sparkle 更新见 [发布说明](docs/DESKTOP_RELEASE.md)。保留 ChatGPT 连接以供后续文稿 AI 扩展；已移除金融页面与桌面 Go 服务。
- **个人云同步**：独立 Go 后端正在开发，保持现有本地优先体验；旧家庭资料 beta 已移除。
- **画布与笔记**：默认 Canvas 承载笔记、公式、图片 / 文件和交互块，桌面结构与附件原件保存为本机 `.nomi` 文件包，浏览器预览使用 IndexedDB，摄像机与个人参数单独保存。
- **交互学习**：声明式 IR 驱动控件、LaTeX、曲线与本地计算，可在 Canvas / 文稿中嵌入；不依赖模型请求。完整笔记产品能力、信息 hub、跨领域知识与完整财富管理仍待扩展。桌面和 server 的身份、数据及 AI 执行路径当前独立，尚无跨端同步。

## macOS 下载

[Nomi 0.1.0 安装包](https://github.com/iFurySt/nomi/releases/tag/desktop-v0.1.0)：选择 Apple Silicon（arm64）或 Intel（x64），需要 macOS 13 或更新版本。打开 DMG，将 Nomi 拖入 Applications；首次启动请允许访问文稿文件夹。应用已签名并通过 Apple 公证；Settings → General 可检查更新和设置自动检查。

## 桌面本地运行

需要 Node.js 24+ 和 pnpm 10+；依赖版本以 lockfile 为准。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm desktop
```

开发模式：`pnpm dev:desktop`；浏览器预览：`pnpm dev`。ChatGPT 连接在桌面账号菜单或 Settings → ChatGPT 中完成，需要在 Nomi 中单独授权；不会复用 AIFi 的登录态。可用模型与推理权限以账号实际授权结果为准。

```sh
pnpm check
pnpm test
pnpm smoke:desktop
pnpm check:interactive-native # 需要 swiftc
make ci
```

迁入来源、数据路径和验证边界见 [桌面开发说明](docs/DESKTOP.md)。

## 可选个人云同步

正在按 [云同步设计](docs/design-docs/cloud-sync.md) 和 [执行计划](docs/exec-plans/active/20261115-personal-cloud-sync.md) 开发。后端独立于桌面，位于 `apps/sync-server`；使用 PostgreSQL 保存文稿内容与版本，开发阶段用服务器持久磁盘存附件。不开启同步无需账号。旧家庭资料 server、iOS 和 Swift macOS 工程已退役，历史发布不会被新工程自动覆盖。

## 文档入口

- [当前产品定位](docs/product-specs/personal-workbench.md)
- [架构](docs/ARCHITECTURE.md) · [产品判断](docs/PRODUCT_SENSE.md)
- [桌面开发](docs/DESKTOP.md) · [前端](docs/FRONTEND.md)
- [安全](docs/SECURITY.md) · [部署](docs/DEPLOYMENT.md)

旧 server 自动部署已停用；新同步服务部署流程见部署文档。桌面通过 `desktop-v*` tag 自动构建签名、公证的 DMG 与 Sparkle feed。

## 许可证

原有 Nomi 代码使用 [MIT](LICENSE)。从 AIFi 迁入的桌面应用、共享包、本地 CLI 和配套脚本及其修改保留 [AGPL-3.0-only](LICENSE.aifi)，具体范围与来源见 [NOTICE](NOTICE)。Electron、Sparkle 等第三方组件保留各自许可证，分发包内包含对应声明。
