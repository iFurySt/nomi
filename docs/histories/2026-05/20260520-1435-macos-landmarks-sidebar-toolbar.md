## [2026-05-20 14:35] | Task: align macOS sidebar and toolbar with Landmarks

### Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### User Query

> 对比 `tmp/references` 里的 Landmarks，左侧边栏改成原生样式，正文背景对齐，并去掉顶部横线。

### Changes Overview

**Scope:** `apps/macos/Nomi`, `docs`

**Key Actions:**

- **[Native sidebar]**: 将 macOS sidebar 从自绘按钮 / hover / 选中背景改为系统 `.sidebar` `List(selection:)` + `Label`。
- **[System background]**: sidebar 保持系统 material，正文区域切换为稳定的暖灰内容 surface。
- **[Toolbar separator]**: 隐藏 window toolbar background，移除内容区顶部横线；`+` Add 按钮保留在 detail content toolbar 中。
- **[Docs sync]**: 更新架构、前端和质量评分文档，记录 Landmarks-style sidebar / toolbar 约束。

### Design Intent (Why)

Landmarks 示例让系统负责 sidebar 选中态、背景、行密度和 toolbar 视觉。Nomi 之前手写背景和行样式，和系统窗口 chrome 不协调，并在内容顶部形成明显分隔线。收回系统样式可以减少自定义视觉负担，让桌面端更接近原生 macOS。

### Files Modified

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
