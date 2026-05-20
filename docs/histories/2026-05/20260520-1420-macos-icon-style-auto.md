## [2026-05-20 14:20] | Task: macOS icon style auto selection

### Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### User Query

> macOS 26 上 Dock 图标显示成旧系统兼容白色圆角 plate；检查是否被最近构建影响。

### Changes Overview

**Scope:** `apps/macos/Nomi`, `docs`

**Key Actions:**

- **[Build icon selection]**: `scripts/build-app.sh` 默认根据当前 macOS major version 自动选择 app icon。
- **[Manual override]**: 支持 `NOMI_MACOS_ICON_STYLE=auto|macos26|traditional`，方便复现 macOS 26 或旧系统图标打包。
- **[Docs sync]**: 更新 macOS 前端说明，明确 `AppIcon-macos26.icns` 与传统 `AppIcon.icns` 的分工。

### Design Intent (Why)

Nomi 的 SwiftPM 手工 `.app` 不能像 Xcode asset catalog 一样让系统按平台自动选 icon。之前 `build-app.sh` 无条件拷贝传统 `AppIcon.icns`，导致 macOS 26 上也显示给旧系统预渲染的白色圆角 plate。构建脚本应按运行系统选择资源，同时保留显式覆盖入口。

### Files Modified

- `apps/macos/Nomi/scripts/build-app.sh`
- `docs/FRONTEND.md`
