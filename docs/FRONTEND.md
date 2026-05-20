# 前端协作说明

当前前端只有一个版本化移动端实现路径：

- `apps/ios/`：原生 SwiftUI iOS app，是 mobile 体验的主推进方向。
- `apps/macos/Nomi/`：原生 SwiftUI macOS app，是桌面端 MVP 入口；当前使用 SwiftPM executable 组织，复用 server records API。

## 原生 iOS 本地启动

Debug 构建默认使用 `http://127.0.0.1:8088`，TestFlight / Release 构建默认使用 `https://nomi.ifuryst.com`。本地或自动化需要覆盖时，继续通过 `NOMI_API_BASE_URL` 注入。

```sh
xcodebuild -project apps/ios/Nomi.xcodeproj \
  -scheme Nomi \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=<simulator-udid>' \
  build

xcrun simctl install <simulator-udid> \
  ~/Library/Developer/Xcode/DerivedData/Nomi-*/Build/Products/Debug-iphonesimulator/Nomi.app
xcrun simctl launch --terminate-running-process <simulator-udid> dev.nomi.native
```

上传 sheet 截图验证可用 simulator-only 环境变量打开初始 sheet：

```sh
SIMCTL_CHILD_NOMI_OPEN_UPLOAD=1 \
  xcrun simctl launch --terminate-running-process <simulator-udid> dev.nomi.native
```

## 当前界面

- Native iOS Home：顶部是“今天”总览，覆盖摄入能量、剩余卡路里、蛋白质、力量训练、步行、久坐和睡眠等今日数据，并从真实 timeline items 派生；初始状态不填假数据，空 timeline 不显示 `Timeline 0` 标题行。底部使用 iOS 26 原生 `TabView` Liquid Glass tab bar：左侧“今天”/“我的”为普通 tab 组，右侧“添加”使用 `TabRole.search` 分离成独立圆形 action，中间空档、按压 glass 高亮、左右移动预览和释放确认都交给系统实现。Add 打开上传 sheet 后回到上一个内容 tab，“我的”进入只包含中文语言切换的 My 页，暂不提供英文界面。Home / My 使用系统黑白灰语义色、统一 Dynamic Type 字体 token 和低装饰灰阶 timeline；Log / Trends 暂不回到主入口，避免空页面和解释文案占据产品界面。
- Native iOS Upload Sheet：提供 Camera / Photos / Files 三个来源，并使用系统 sheet 背景、单一 detent、drag indicator 和系统外层圆角；不再对 sheet 外层设置固定 `.presentationCornerRadius(...)` 或整页自定义背景。单一 detent 用于避免上拖进入 full-height sheet 时出现另一套更实的系统视觉状态。Photos 使用 `PhotosPicker`，Files 使用 SwiftUI `fileImporter`，选择图片后通过 `POST /ai/extract-image` 取得 SeedX/Codex metadata；server 会在同一请求里保存图片和 record，iOS 只在 response 没有 `record_id` 的 fallback 场景才补一次 `/records`。app 下次启动通过 `GET /records` 恢复 timeline。Simulator 上 Camera 暂为 unavailable placeholder。
- Native iOS Language：首次启动根据 iOS 语言自动写入中文语言值；非中文系统默认简体中文。之后 My 页只提供中文语言切换，不放其他占位设置。语言选择通过 `@AppStorage` 持久化，并用 SwiftUI locale 立即更新界面；当前只提供 `简体中文` 与 `繁體中文`，暂不支持英文。`en.lproj` 只作为系统 fallback，并写入中文文案。
- Native macOS Health Records：桌面端当前按 Figma MVP 信息架构实现为 Landmarks-style 原生 SwiftUI 窗口：`WindowGroup` 承载 `NavigationSplitView(preferredCompactColumn:)` sidebar + 右侧内容区。sidebar 使用系统 `.sidebar` List 外壳，固定包含概览、记录、数据、洞察、提醒、我的和设置入口；页面路由由右侧 `NavigationStack` 和当前 section state 驱动，行内自定义选中 / hover 背景。sidebar 背景使用比主体 `#FAFAF8` 更深的暖灰 `#E2E2DC`，选中行使用柔和深灰底白字，hover 使用更深一档灰，并参考 Landmarks 的原生 `List` sidebar 密度约束系统 sidebar 列宽、收紧 list row inset、行高、图标和文字尺寸，避免大窗口下侧栏与行项目显得过宽。窗口红黄绿按钮、sidebar toggle 和当前 section title 交给 macOS 系统 titlebar / toolbar；toolbar 暂时只保留一个参考 Landmarks Collections 写法的原生 `+` Add 按钮，即 `.toolbar { ToolbarItem(placement: .automatic) { Button { Image(systemName: "plus") } } }`，搜索入口先不放回 toolbar。概览页覆盖健康评分、步数、活动、睡眠、今日建议、最近记录、AI 洞察和数据来源；记录页覆盖分类筛选、列表分组、右侧详情面板、营养识别、相关数据和备注。Add 使用居中 overlay，直接叠在当前页面上，不虚化或移动底层内容，面板外点击、再次点击 Add、Escape 或应用失焦都可关闭；点击 / 拖拽图片或 PDF 后通过 `POST /ai/extract-image` 走本地 server + SeedX/Codex 并保存为 record，手动文字记录保留为 fallback。PDF 上传由 server 生成 JPEG 预览后交给 Codex 分析，主要用于体检、检查、报告、发票和收据等 information/document 记录。详情图支持放大预览 overlay，直接叠在当前页面上，不虚化背景，并保留大图、关闭 / 收藏 / 更多 / 翻页 / 编辑 / 分享 / 删除入口和底部详情区。视觉使用 macOS 系统窗口、SwiftUI material、Figma 灰阶 surface、轻阴影、圆角和打包进 app 的参考图片资源，不复刻 iOS 底栏或窗口 chrome。macOS 手工 bundle 和 DMG 对外统一命名为 `Nomi`；源图保留为 `nomi-logo.png`，macOS 26 / asset-catalog 风格的原始 `.icns` 保留为 `AppIcon-macos26.icns`，传统兼容图标保留为 `AppIcon.icns`，该文件预渲染 1024 透明画布、824 圆角可见 plate 和原图内容，避免 macOS 15 Dock / Finder 把图标显示成直角方块。`scripts/build-app.sh` 默认按当前系统自动选择图标：macOS 26 及以上打包 `AppIcon-macos26.icns`，旧系统打包传统 `AppIcon.icns`；需要复现时可用 `NOMI_MACOS_ICON_STYLE=macos26|traditional|auto` 覆盖。
- Native macOS Records Empty：记录页在全局无记录时不显示分类 tab、列表卡片或筛选空态，只在内容区居中显示 tray icon、“还没有记录”和简短添加引导；只有存在至少一条记录后才显示分类 tab。如果只是当前分类没有记录，则保留分类 tab 并显示轻量分类空态。

## 原生 macOS 本地启动

Debug 默认使用 `http://127.0.0.1:8088`，和 iOS 一样可通过 `NOMI_API_BASE_URL` 覆盖。

```sh
cd apps/macos/Nomi
./scripts/build-app.sh
./scripts/build-dmg.sh

NOMI_API_BASE_URL=http://127.0.0.1:8088 .build/Nomi.app/Contents/MacOS/Nomi
```

图片导入联调需要先启动 server，并保持 SeedX daemon 长连接在线：

```sh
cd apps/server
NOMI_SEEDX_API_KEY=dev_seedx_key go run ./cmd/nomi-server --addr :8088

seedx daemon connect --server-url http://localhost:8088 --api-key dev_seedx_key
```

产物位置：

- `.build/Nomi.app`
- `.build/dist/Nomi.dmg`

## 设计约束

- 设计方向以 `docs/DESIGN.md` 为准：quiet、personal、less is more、Apple-like；具体 UIUX、动效、底栏、timeline 和参考链接见 `docs/UIUX_REFERENCE.md`。
- 当前视觉保留大留白和轻卡片，但颜色收敛到系统 black / white / gray 语义色；不要恢复暖纸、橙色主按钮、棕红投影或绿色指标主题。
- iOS 26 Liquid Glass 控件优先用系统组件和 glass APIs；底部主导航优先用原生 `TabView` / `TabRole.search`，不要手画选中胶囊、高光或整组热区。自定义 glass 控件仍需显式指定圆形或胶囊 shape，并通过 `GlassEffectContainer` / `glassEffectUnion` 管理多个相邻 glass shape。内容层使用统一灰阶 `NomiContentSurface`，Liquid Glass 主要保留在 navigation / controls / sheet 这类浮动交互层。
- 字体统一用系统 SF / Dynamic Type text styles，并通过实现内 `NomiType` token 管理；不要在页面里散落固定字号或 `.rounded` 字体。
- 涉及底栏前先看 `docs/UIUX_REFERENCE.md` 的 “iOS 26 Liquid Glass 外部参考” 和 “iOS 26 底栏实现守则”。除非系统 `TabView` 明确不满足，不要恢复自定义 `BottomFloatingControls` 或手画 glass overlay。
- 优先使用系统感强的排版、清晰留白、克制色彩、图标按钮和选项控件；上传流里尽量让用户选择而不是输入，解释性文案默认删减。
- 不使用医疗 dashboard、告警、风险评分、红黄警示或诊断 / 治疗文案。
- Capture 是主动作；Ask 需要保持有来源、有边界的个人记录助手语气。

## 验收方式

- 触及图片 AI extraction contract 时，额外运行 `cd apps/server && go test ./...`，并在 server 启动、SeedX daemon 长连接在线后，用 Photos / Files 两类来源各打一张本地图片到 `POST /ai/extract-image`，确认返回 `record_id`、`schema_version`、`input_category`、`output_impacts` 和 nutrition / activity metadata。
- 触及原生 iOS UI 时，至少运行 `xcodebuild ... build`，安装到目标 simulator，截图检查首页和关键 sheet。当前原生 iOS 截图：`nomi-native-home-single-add-warm-2026-05-07.png`、`nomi-native-home-health-summary-2026-05-07.png`、`nomi-native-upload-sheet-spaced-2026-05-07.png`、`nomi-native-upload-sheet-refined-2026-05-07.png`、`nomi-native-real-upload-empty-2026-05-07.png`、`nomi-native-real-upload-files-2026-05-07.png`、`nomi-native-record-reload-2026-05-07.png`、`nomi-native-ios26-bottom-system-tabbar-2026-05-08.png`、`nomi-native-gray-home-2026-05-08.png`、`nomi-native-system-sheet-gray-2026-05-08.png`、`nomi-native-gray-my-2026-05-08.png`、`nomi-native-gray-language-sheet-2026-05-08.png`。
- 触及原生 iOS upload / AI path 时，优先跑真实 iOS Simulator UI test，覆盖底栏“添加”、上拉上传 sheet、系统 PhotosPicker、系统 fileImporter、上传按钮和“今天”时间线插入。先准备素材：`xcrun simctl addmedia <simulator-udid> <photo-path>`；Files 测试还需要把图片复制到 `com.apple.DocumentsApp` 的 `group.com.apple.FileProvider.LocalStorage/File Provider Storage/`。命令：`xcodebuild test -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=<simulator-udid>' -only-testing:NomiUITests/NomiUploadFlowUITests`。
- 原生 iOS 仍保留 simulator-only `NOMI_E2E_AUTO_UPLOADS=1` 作为低层 runtime / contract smoke：先把 `nomi-e2e-uploads.json` 和图片复制到 app Documents，再 launch app；结果写入 app Documents 的 `nomi-e2e-results.log`，每行应包含 `NOMI_E2E_UPLOAD_RESULT ok <source> <file> 2026-05-08.seedx-codex-image.v1 <category> <title> <confidence>`。它不能替代真实 picker UI test。
- 有明显视觉改动时，生成或保留截图证据到 `docs/generated/verification/`，并在 history 里记录命令。本轮 upload-only 重做截图：`mobile-upload-redesign-idle-2026-05-06.png`、`mobile-upload-redesign-menu-2026-05-06.png`、`mobile-upload-redesign-processing-2026-05-06.png`、`mobile-upload-redesign-review-2026-05-06.png`、`mobile-upload-redesign-menu-refined-2026-05-06.png`、`mobile-upload-redesign-simulator-tuned-2026-05-06.png`。悬浮玻璃底栏截图：`mobile-floating-glass-nav-idle-2026-05-07.png`、`mobile-floating-glass-nav-menu-2026-05-07.png`。iOS 26 / WWDC25 样式统一截图：`nomi-native-ios26-style-home-2026-05-08.png`、`nomi-native-ios26-style-upload-sheet-2026-05-08.png`、`nomi-native-ios26-style-sidebar-zh-2026-05-08.png`。本轮 refinement 截图：`nomi-native-ios26-refined-home-2026-05-08.png`、`nomi-native-ios26-refined-upload-sheet-2026-05-08.png`、`nomi-native-ios26-refined-sidebar-zh-2026-05-08.png`、`nomi-native-ios26-bottom-system-tabbar-2026-05-08.png`。
- 触及原生 macOS UI 时，至少运行 `cd apps/macos/Nomi && ./scripts/build-app.sh`，并用 Computer Use 验证概览、记录页、Add overlay 和图片预览 overlay 可进入。sidebar / window chrome 变更还要确认左上角只出现系统自带一组红黄绿窗口按钮，且内容区没有额外应用内顶部栏。本轮 Figma MVP 截图证据：`nomi-macos-figma-dashboard-2026-05-11.png`、`nomi-macos-figma-records-detail-2026-05-11.png`、`nomi-macos-figma-add-overlay-2026-05-11.png`、`nomi-macos-figma-image-preview-2026-05-11.png`、`nomi-macos-native-sidebar-2026-05-11.png`、`nomi-macos-landmarks-style-sidebar-2026-05-11.png`、`nomi-macos-calendar-toolbar-icons-2026-05-11.png`、`nomi-macos-expandable-toolbar-search-2026-05-11.png`、`nomi-macos-native-glass-toolbar-search-2026-05-11.png`、`nomi-macos-separated-toolbar-icons-light-add-2026-05-11.png`、`nomi-macos-add-overlay-no-bg-shift-2026-05-11.png`、`nomi-macos-search-collapse-stable-2026-05-11.png`、`nomi-macos-sidebar-search-focus-2026-05-11.png`。触及图片导入时，同步启动本地 server 和 `seedx daemon connect ...`，用 Debug app 选择一张本地图片并确认 Records 列表刷新出 SeedX/Codex 生成的记录。

## 测试策略

当前原生 SwiftUI app 有独立 UI test target 覆盖 Photos / Files 真实 picker 上传到 Today timeline，并有 `NOMI_DISABLE_RECORD_SYNC=1` 用于让 picker 测试不受本地 server 历史记录影响。后续应把 record reload、真实模型 adapter、camera capture 真机链路和 timeline filtering 升级为更完整的自动化测试。
