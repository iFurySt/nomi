## [2026-05-07 12:56] | Task: 原生 iOS mobile shell

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI / zsh / Xcode 26.3 / iPhone 17 Pro simulator`

### User Query

> 将当前 React Native mobile 原型改为 Swift 原生 iOS app，先实现首页和导航栏 `+` 打开的上传上拉页；其他页面占位；风格参考 Apple / Liquid Glass，并在 iPhone 17 Pro simulator 自测截图，每个重要 milestone 提交。

### Changes Overview

**Scope:** `apps/ios/`、`docs/`

**Key Actions:**

- **Native iOS scaffold**: 新增 versioned `apps/ios/NomiNative.xcodeproj`，目标 iOS 26.0，bundle id `dev.nomi.native`。
- **Home screen**: 实现 SwiftUI 首页，包含顶部全局总览、今日上传 timeline、玻璃卡片、系统 tab 占位和导航栏 `+`。
- **Upload sheet**: 实现上拉上传页，支持 Camera placeholder、PhotosPicker、fileImporter、图片选择后的本地 timeline 插入路径，以及上传进度动画。
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
