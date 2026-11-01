# Nomi / 知己

Nomi 是个人一站式工作台：把学习、笔记、信息 hub、知识、健康与财富管理放在一个持续积累的个人空间里，用 AI 帮助整理、连接、查询和理解，并可按需扩展到家庭成员。

## 当前开发重点

下一阶段优先实现 **DSL 驱动的笔记、无限画布与交互学习 / GenUI**：完整长笔记支持 Markdown / LaTeX，混排图片、文件、手写与交互组件；同一语义协议支持未来的 Apple / Android 原生 renderer。默认桌面入口现在是 **Canvas**：可平移 / 缩放，创建和摆放长笔记、图片、文件与交互学习块，支持本地保存、聚焦编辑和文档 DSL。交互计算已有 TypeScript / Swift 一致性验证。手写、AI 生成、原生移动编辑和跨端同步仍待实现。见 [画布实现](docs/design-docs/canvas-workspace-runtime.md)、[交互运行时](docs/design-docs/interactive-learning-runtime.md)、[整体设计](docs/design-docs/notes-infinite-canvas.md)、[DSL 草案](docs/design-docs/notes-canvas-dsl.md)、[GenUI 修订](docs/design-docs/generative-interactive-content.md) 和 [格式示例](docs/design-docs/notes-canvas-example/README.md)。

## 当前状态

- **Electron 桌面 0.1.0**：Canvas 与文稿，支持 Markdown / LaTeX、图片、文件、表格、交互内容与 `.nomi` 文件包。macOS DMG 和 Sparkle 更新见 [发布说明](docs/DESKTOP_RELEASE.md)。保留 ChatGPT 连接以供后续文稿 AI 扩展；已移除金融页面与桌面 Go 服务。
- **iOS + Go server private beta**：已有家庭账号、一次性邀请、成员档案、资料上传、异步整理与带来源引用的连续对话。原件和长期上下文在独立 household filesystem workspace，权限与任务在 Postgres。
- **画布与笔记**：默认 Canvas 承载笔记、公式、图片 / 文件和交互块，桌面结构与附件原件保存为本机 `.nomi` 文件包，浏览器预览使用 IndexedDB，摄像机与个人参数单独保存。
- **交互学习**：声明式 IR 驱动控件、LaTeX、曲线与本地计算，可在 Canvas / 文稿中嵌入；不依赖模型请求。完整笔记产品能力、信息 hub、跨领域知识与完整财富管理仍待扩展。桌面和 server 的身份、数据及 AI 执行路径当前独立，尚无跨端同步。

## macOS 下载

[Nomi 0.1.0 安装包](https://github.com/iFurySt/nomi/releases/tag/desktop-v0.1.0)：选择 Apple Silicon（arm64）或 Intel（x64），需要 macOS 13 或更新版本。打开 DMG，将 Nomi 拖入 Applications。应用已签名并通过 Apple 公证；Settings → General 可检查更新和设置自动检查。

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

## 家庭资料服务与 iOS

```sh
cd apps/server
go test ./...
NOMI_DATABASE_URL='postgres://...' \
NOMI_BOOTSTRAP_INVITE_CODE='local-private-code' \
NOMI_SEEDX_API_KEY='local-seedx-key' \
go run ./cmd/nomi-server --addr :8088

seedx daemon connect \
  --server-url http://127.0.0.1:8088 \
  --api-key local-seedx-key
```

```sh
xcodebuild -project apps/ios/Nomi.xcodeproj \
  -scheme Nomi \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

首次注册使用 `NOMI_BOOTSTRAP_INVITE_CODE` 创建唯一家庭；之后由 owner 生成一次性家人邀请码。现有 beta 家庭成员默认可访问家庭全部资料；未来个人私有空间不能直接沿用这个权限假设。

## 文档入口

- [当前产品定位](docs/product-specs/personal-workbench.md)
- [架构](docs/ARCHITECTURE.md) · [产品判断](docs/PRODUCT_SENSE.md)
- [桌面开发](docs/DESKTOP.md) · [前端与 iOS](docs/FRONTEND.md)
- [家庭资料 beta 范围](docs/product-specs/family-private-beta.md)
- [安全](docs/SECURITY.md) · [部署](docs/DEPLOYMENT.md)

Server 通过 `server-v*` tag 发布到 GHCR 并部署 amoylab；桌面通过 `desktop-v*` tag 自动构建签名、公证的 DMG 与 Sparkle feed。

## 许可证

原有 Nomi 代码使用 [MIT](LICENSE)。从 AIFi 迁入的桌面应用、共享包、本地 CLI 和配套脚本及其修改保留 [AGPL-3.0-only](LICENSE.aifi)，具体范围与来源见 [NOTICE](NOTICE)。Electron、Sparkle 等第三方组件保留各自许可证，分发包内包含对应声明。
