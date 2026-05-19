## [2026-05-19 23:53] | Task: 调整 macOS 记录空态

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### User Query

> macOS 记录页没有数据时不要显示分类 tab 行，改成居中的简单空态。

### Changes Overview

**Scope:** `apps/macos/Nomi/`, `docs/`

**Key Actions:**

- **[Records empty state]**: 全局无记录时隐藏分类 tab 和列表卡片，内容区只显示居中 tray icon、标题和简短添加引导。
- **[Filtered empty state]**: 有记录但当前分类为空时保留分类 tab，并显示轻量分类空态，避免和全局无记录混淆。
- **[Verification]**: 重建 macOS app，并用 Computer Use 验证记录页无数据时的空态布局；截图保存到 `docs/generated/verification/nomi-macos-records-empty-centered-2026-05-19.png`。
- **[Docs]**: 更新 `docs/FRONTEND.md`，记录全局空态和分类空态的显示边界。

### Design Intent (Why)

记录页全局无数据时，分类 tab 没有可操作对象，且会把页面重心压到靠下的大卡片里。改成居中空态能让首次使用状态更安静，也和 macOS 桌面端当前的简洁视觉方向一致。

### Files Modified

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/FRONTEND.md`
- `docs/generated/verification/nomi-macos-records-empty-centered-2026-05-19.png`
- `docs/histories/2026-05/20260519-2353-macos-records-empty-state.md`
