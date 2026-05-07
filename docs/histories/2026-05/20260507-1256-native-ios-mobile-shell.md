## [2026-05-07 12:56] | Task: 原生 iOS mobile shell

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI / zsh / Xcode 26.3 / iPhone 17 Pro simulator`

### User Query

> 将当前 React Native mobile 原型改为 Swift 原生 iOS app，先实现首页和上传上拉页；其他页面占位；风格参考 Apple / Liquid Glass，并在 iPhone 17 Pro simulator 自测截图，每个重要 milestone 提交。后续按截图反馈把上传入口移到底部导航栏中间、加大 Upload sheet 顶部留白，收紧首页 timeline，把底栏从过重的参考图样式调回 Nomi 自身的轻量玻璃语言，恢复底栏按住左右滑动的连续切换交互，并把中间上传入口内化为普通 Add 导航项。

### Changes Overview

**Scope:** `apps/ios/`、`docs/`

**Key Actions:**

- **Native iOS scaffold**: 新增 versioned `apps/ios/NomiNative.xcodeproj`，目标 iOS 26.0，bundle id `dev.nomi.native`。
- **Home screen**: 实现 SwiftUI 首页，包含顶部全局总览、紧凑今日 timeline、玻璃卡片、占位 tab 和底部导航栏中间 Add 上传项。
- **Upload sheet**: 实现上拉上传页，支持 Camera placeholder、PhotosPicker、fileImporter、图片选择后的本地 timeline 插入路径，以及上传进度动画。
- **Feedback pass**: 根据视觉反馈移除顶部 `+`，新增自定义底部 glass nav；Upload sheet 顶部标题和关闭按钮增加上边距；timeline 改成时间 rail + 88pt 紧凑卡片。
- **Bottom nav correction**: 将上一版过大的黑色胶囊底栏收回为较小的暖色玻璃底栏，中间上传入口保持主动作位置，tab 选中态改为滑动玻璃底托以保留按键之间的流动感。
- **Bottom nav gesture**: 将底栏从多个孤立按钮改为整条 bar 的 `DragGesture(minimumDistance: 0)`，按住左右滑动时根据手指 x 位置实时切换 tab；中间 Add 仅在从 Add 起手轻点释放时打开上传。
- **Upload nav item**: 将中间上传入口从独立圆形 `+` 改为普通 Add 导航项，和其他 tab 保持 48x50 尺寸、文字标签、轻量按压反馈与底栏调性一致。
- **Motion / style**: 使用 SwiftUI spring / smooth 动画、symbolEffect、contentTransition、glass button style 和 glassEffect，贴近 Apple-like / Liquid Glass 方向。
- **Verification**: 在 iPhone 17 Pro simulator build / install / launch，并保存首页和上传 sheet 截图。

### Design Intent (Why)

原生迁移不应建立在 Expo generated iOS output 上，因此新增 `apps/ios/` 作为长期版本化边界。首版只覆盖用户要求的两个核心页面，保留 Ask / Trends 占位，避免继续扩大产品面；上传页先接入系统 Photos / Files 选择边界，让页面不是纯静态 mock。

### Files Modified

- `apps/ios/NomiNative.xcodeproj/project.pbxproj`
- `apps/ios/NomiNative/NomiNativeApp.swift`
- `apps/ios/NomiNative/ContentView.swift`
- `apps/ios/NomiNative/Info.plist`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
- `docs/exec-plans/completed/2026-05-07-native-ios-mobile-shell.md`
- `docs/generated/verification/nomi-native-home-2026-05-07-clean.png`
- `docs/generated/verification/nomi-native-upload-sheet-2026-05-07-final-action.png`
- `docs/generated/verification/nomi-native-home-bottom-plus-timeline-2026-05-07.png`
- `docs/generated/verification/nomi-native-upload-sheet-spaced-2026-05-07.png`
