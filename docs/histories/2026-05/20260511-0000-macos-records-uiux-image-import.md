# macOS Records UIUX And Image Import

## 用户诉求

macOS 版本已有，但界面太丑、无用元素太多；按给定视觉方向调整 UIUX，并在本地拉起 server / SeedX，用 Debug app 连本地验证整体功能。

## 主要改动

- 将 macOS Records 从只有一个入口的 `NavigationSplitView` sidebar 收敛为单窗格记录流，减少左侧空 chrome 和重复标题。
- 记录行从重卡片改为轻分隔列表，正文宽度收窄，窗口最小尺寸降低，让内容成为首屏重点。
- Add sheet 增加 `Choose Image` 主入口，选择图片后调用同一个 server `POST /ai/extract-image`，由本地 SeedX/Codex 分析并保存记录。
- 保留手动文字记录 fallback，但弱化为次级保存按钮。
- 早期曾将 SwiftPM macOS app 入口改为显式 AppKit `NSWindow` 承载 `ContentView`，避免手工打包 `.app` 时进程启动但没有可见窗口；后续 Landmarks-style sidebar pass 已移除这层手工窗口入口。
- 同步更新 macOS 架构、前端说明和质量评分文档。
- 后续迭代按 Figma 文件 `YzJi7uEIR0SGi0kWSbQLsS` 的节点 `2:2`、`20:5`、`25:2`、`43:2` 重建 macOS MVP UI：恢复左侧 sidebar 母版、统一顶部 breadcrumb / search / Add 入口、健康看板、记录列表详情、添加记录 overlay 和图片预览 overlay。
- 将 Figma 参考图片打包为 SwiftPM resources，并更新 `build-app.sh` 复制 resource bundle，保证手工 `.app` 内缩略图和大图可正常显示。
- Add overlay 支持点击 file importer、拖拽文件 URL 和文本 fallback；图片预览 overlay 支持从详情图放大进入和关闭返回。
- 继续修正 sidebar 实现：去掉内容层手画的三色窗口按钮和伪 sidebar toggle，参考本机 `LandmarksBuildingAnAppWithLiquidGlass` 示例改用原生 `NavigationSplitView` + `.sidebar` List + `NavigationLink(value:)`，让窗口 chrome 和 sidebar 折叠按钮回到 macOS 系统承载。
- 再按 `LandmarksBuildingAnAppWithLiquidGlass` 收口底层窗口结构：移除手工 AppKit `NSWindow` 入口，改为 SwiftUI `WindowGroup` 承载 `NavigationSplitView(preferredCompactColumn:)`；保留系统红黄绿 / sidebar toggle，把搜索和 Add 移到 SwiftUI toolbar / searchable，删除内容层 breadcrumb / search / Add 顶部栏。

## 设计动机

- 当前 macOS 只有 Records 一个真实页面，sidebar 只会增加无效导航和视觉噪音；等 Log / Ask / Trends 等桌面端入口有真实内容后再恢复侧栏更合适。
- 用户要求联调 server + SeedX，macOS Add 必须覆盖图片分析主链路，否则只能验证文字记录，不能代表 Nomi 的真实 capture 流程。
- 桌面端不复刻 iOS 底栏，继续使用 macOS 系统窗口、图标按钮、segmented picker 和原生 file importer。
- Figma 里的三色窗口点只表达 macOS 窗口环境，不是 app 内容组件；实现时应优先判断哪些属于系统 chrome，不能逐项机械复刻到 SwiftUI 内容层。
- macOS 桌面端应该参考 Landmarks / Calendar 这类系统结构：sidebar、titlebar 和 toolbar 由系统统一管理；内容区不应再额外画一条应用内顶部栏。

## 验证

- `cd apps/macos/NomiMac && ./scripts/build-app.sh`

- `GOTOOLCHAIN=auto go test ./...`（`apps/server`）
- `make check-docs`
- 启动本地 `postgres17`、Nomi server 和 SeedX daemon 后，调用 `POST /ai/extract-image` 成功返回 `record_id`、`schema_version: 2026-05-08.seedx-codex-image.v1`、`input_category` 和 SeedX/Codex 生成的 summary，并可通过 `GET /records` 读回记录。
- Debug app 使用 `NOMI_API_BASE_URL=http://127.0.0.1:8088` 启动；临时诊断确认主窗口 `isVisible == true`。上一阶段 Computer Use / `screencapture` 在本机返回不到 Nomi 窗口画面，因此当时截图证据未可靠生成。
- 后续 Figma MVP 迭代再次运行 `cd apps/macos/NomiMac && ./scripts/build-app.sh`，并通过 Computer Use 验证概览、记录页、添加记录 overlay、图片预览 overlay 都可进入。
- 视觉截图保存到 `docs/generated/verification/nomi-macos-figma-dashboard-2026-05-11.png`、`nomi-macos-figma-records-detail-2026-05-11.png`、`nomi-macos-figma-add-overlay-2026-05-11.png`、`nomi-macos-figma-image-preview-2026-05-11.png`。
- 原生 sidebar 修正后再次运行 `cd apps/macos/NomiMac && ./scripts/build-app.sh`，用 Computer Use 确认左上角只保留系统自带一组三色窗口按钮，sidebar 选择态来自系统 List / NavigationLink；截图保存到 `docs/generated/verification/nomi-macos-native-sidebar-2026-05-11.png`。
- Landmarks-style 窗口修正后再次运行 `cd apps/macos/NomiMac && ./scripts/build-app.sh`，用 Computer Use 确认 accessibility 中出现 `SidebarNavigationSplitView`，系统 sidebar toggle 可折叠 / 展开，内容区没有自定义顶部栏，搜索和 Add 位于系统 toolbar，记录页仍可通过 sidebar 进入；截图保存到 `docs/generated/verification/nomi-macos-landmarks-style-sidebar-2026-05-11.png`。
