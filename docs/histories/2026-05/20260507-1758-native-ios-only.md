## [2026-05-07 17:58] | Task: native iOS only

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI / zsh`

### User Query

> 删除原来的 `apps/mobile`，把应用名改成 Nomi，并清理模拟器里的旧 app，最终只安装保留的那个 app。

### Changes Overview

**Scope:** `apps/ios`、`apps/mobile`、`docs`

**Key Actions:**

- **[Removed Expo app]**: 删除旧 React Native / Expo `apps/mobile`，移动端实现收敛到原生 SwiftUI iOS app。
- **[Renamed product]**: 原生 iOS scheme 改为 `Nomi`，构建产物从 `NomiNative.app` 收敛为 `Nomi.app`；bundle id 继续使用 `dev.nomi.native`，避免产生第三个安装项。
- **[Docs sync]**: 更新 README、architecture、frontend、quality 和 UIUX reference，移除当前开发入口里的 Expo / mobile 说明。

### Design Intent (Why)

现在原生 iOS 已经成为主要移动端实现，继续保留 Expo app 会让模拟器、文档和验证入口出现双 app 混淆。收敛到单一 iOS app 后，后续 UIUX、上传验证和安装路径都只围绕一个产物。

### Files Modified

- `apps/mobile/`
- `apps/ios/NomiNative.xcodeproj/project.pbxproj`
- `apps/ios/NomiNative.xcodeproj/xcshareddata/xcschemes/Nomi.xcscheme`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
- `docs/UIUX_REFERENCE.md`
