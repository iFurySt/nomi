## [2026-05-08 11:48] | Task: iOS 26 Liquid Glass style unification

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI, macOS, iOS 26.3 simulator`

### User Query

> 调研最新 iOS 26 与 WWDC25/WWDC26 的设计建议，参考 iPhone 内置 App 的浮动按钮、圆角、sidebar、icon、button 等样式，把当前移动端 UI 统一起来，减少拼凑感。

### Changes Overview

**Scope:** `apps/ios/`, `docs/`

**Key Actions:**

- **Unified surfaces**: Added shared `NomiContentSurface` and `NomiGlassSurface` modifiers, then moved home metrics, timeline cards, upload preview, and sidebar controls onto consistent surface/radius tokens.
- **Aligned iOS 26 glass usage**: Removed the custom sheet presentation background so the system sheet material can show through; kept Liquid Glass on floating navigation/control layers and used `ConcentricRectangle` for nested rounded surfaces.
- **Reduced visual noise**: Replaced ad hoc colors with palette tokens, limited primary tint to the upload action, softened sidebar backdrop, and removed the repeating home pulse animation.
- **Captured evidence**: Saved new home, upload sheet, and sidebar screenshots under `docs/generated/verification/`.

### Design Intent (Why)

WWDC25 / iOS 26 guidance emphasizes Liquid Glass as a navigation/control layer, selective tint for primary actions, system-provided sheet and toolbar materials, monochrome SF Symbols, and concentric corner geometry. The UI now uses those rules as code primitives instead of one-off `RoundedRectangle`, tint, and shadow choices, while preserving Nomi's quiet warm-paper product direction.

WWDC26 has been announced for 2026-06-08 to 2026-06-12, but concrete design sessions are not available yet as of 2026-05-08, so the implementation uses the current iOS 26 / WWDC25 / HIG guidance.

### Files Modified

- `apps/ios/NomiNative/ContentView.swift`
- `docs/UIUX_REFERENCE.md`
- `docs/FRONTEND.md`
- `docs/generated/verification/nomi-native-ios26-style-home-2026-05-08.png`
- `docs/generated/verification/nomi-native-ios26-style-upload-sheet-2026-05-08.png`
- `docs/generated/verification/nomi-native-ios26-style-sidebar-zh-2026-05-08.png`

### Follow-up Refinement

**[2026-05-08 12:05]** 用户根据截图指出底部 Add、Add sheet 字号 / 关闭按钮、sheet 上拖样式变化和 sidebar 背景异常。按这轮反馈继续收口：

- 将底部 Add 从居中小按钮改为右下角较大的圆形 glass 按钮，去掉 clay tint，参考 Contacts 这类系统 App 的浮动新增按钮。
- 将 Add sheet 改为单一 detent，避免上拖进入 full-height 后出现另一套更实的系统 sheet 视觉状态；同步降低标题、来源按钮、关闭按钮和主动作 tint 的视觉强度。
- 打开 sidebar 时不再推动或缩放正文，隐藏底部 Add，避免背后正文上下或底部浮动按钮露出造成错觉。
- 新增截图：`nomi-native-ios26-refined-home-2026-05-08.png`、`nomi-native-ios26-refined-upload-sheet-2026-05-08.png`、`nomi-native-ios26-refined-sidebar-zh-2026-05-08.png`。

### Follow-up Bottom Groups

**[2026-05-08 12:41]** 用户要求底部控件改成最新 Liquid Glass 双分组，但不要把按钮做得过大，也不要把整条不可见区域作为手势热区；“我的”不再从左侧 drawer 出来，当前 My 页只保留语言切换。

- 将底部控件改为左侧紧凑 Today / 我的胶囊组、右侧独立 Add 圆形组，中间保留不可点空档。
- 按官方 `GlassEffectContainer` / `glassEffect(_:in:)` 模式，把 glass shape 放在同一 container 内 morph；手势绑定到每个按钮本身，只有从按钮按住才出现 glass 高亮，拖到另一个按钮松开才确认。
- 移除左上角 sidebar 入口和未使用 sidebar 代码，My 页只保留语言行，语言 sheet 支持 English / 简体中文 / 繁體中文。
- 新增 / 更新截图：`nomi-native-ios26-bottom-glass-groups-2026-05-08.png`。
- 验证：`xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'generic/platform=iOS Simulator' build`；`xcodebuild test -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=8239FF81-AFE7-4453-9263-F4D9A5BC63E9' -only-testing:NomiNativeUITests/NomiNativeUploadFlowUITests/testBottomFloatingControlsOpenUploadAndLanguageSettings`。

**[2026-05-08 14:12]** 用户补充 Donny Wals iOS 26 tab bar 文章和 LiquidGlassSwiftUI repo，要求停止手写模拟，改用系统推荐能力。

- 将自定义 `BottomFloatingControls` 删除，根视图改为原生 `TabView(selection:)`。
- Today / Me 使用普通 `Tab`，Add 使用 `TabRole.search` 成为右侧独立圆形 Liquid Glass action；点击 Add 只打开上传 sheet，并把 selection 回退到上一个内容 tab。
- 保留 `bottom-today` / `bottom-me` / `bottom-add` accessibility identifiers，现有 XCUITest 继续覆盖 Add sheet、My 页和语言切换。
- 新增截图：`nomi-native-ios26-bottom-system-tabbar-2026-05-08.png`。
- 验证：`xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build`；`xcodebuild test -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:NomiNativeUITests/NomiNativeUploadFlowUITests/testBottomFloatingControlsOpenUploadAndLanguageSettings -only-testing:NomiNativeUITests/NomiNativeUploadFlowUITests/testMyLanguageSheetSwitchesBetweenChineseAndEnglish`。

**[2026-05-08 14:25]** 将这次参考和踩坑整理进 docs，避免后续迭代继续自绘 Liquid Glass 底栏。

- 在 `docs/UIUX_REFERENCE.md` 新增 iOS 26 Liquid Glass 外部参考入口：Donny Wals tab bar 文章、`glassEffectUnion` 文章和 `LiquidGlassSwiftUI` 示例 repo。
- 新增 “iOS 26 底栏实现守则”，明确 Nomi 当前底栏必须优先使用 `TabView` / `TabRole.search`，禁止手画选中胶囊、镜面高光、整组热区和自定义 `BottomFloatingControls` 回潮。
- 在 `docs/FRONTEND.md` 和 `docs/references/README.md` 增加路由说明，让后续触碰底栏前先读 UIUX reference。
