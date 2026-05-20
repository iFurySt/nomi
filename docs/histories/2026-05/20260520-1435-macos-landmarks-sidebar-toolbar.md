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
- **[Records empty copy]**: 将全局记录空态标题改为“暂无数据”，副文案保留“拖入图片或 PDF”。
- **[Add overlay background]**: 保留原来的大上传 drop zone、尺寸和信息层级；将 overlay 外层改为略亮于 `#F8F8F7` 的实体 panel 背景以视觉对齐系统 sidebar material，并把阴影限制在外层圆角背景 shape 上，避免整组内容投影把 panel 内部染灰。
- **[Text input polish]**: 手动文本区域改用原生 `NSTextView` 承载多行输入和鼠标滚动；给 text container 保留小 inset 避免 caret 在左边缘被裁，并在 SwiftUI 外层保留 compose box 风格 placeholder、I-beam hover 和 14px 视觉 inset。
- **[Dismiss behavior]**: 移除应用失焦自动关闭 Add overlay 的 observer，仅保留关闭按钮、Escape、再次点击 Add 和点击 app 内 overlay 外区域关闭。
- **[Docs sync]**: 更新架构、前端和质量评分文档，记录 Landmarks-style sidebar / toolbar 约束。

### Design Intent (Why)

Landmarks 示例让系统负责 sidebar 选中态、背景、行密度和 toolbar 视觉。Nomi 之前手写背景和行样式，和系统窗口 chrome 不协调，并在内容顶部形成明显分隔线。收回系统样式可以减少自定义视觉负担，让桌面端更接近原生 macOS。Apple 的 macOS 26 / Liquid Glass 指导强调把 material 用在合适的 navigation / control 层，并让 AppKit / SwiftUI 标准组件继承平台外观；Add overlay 在本轮视觉校准后使用略亮于 `#F8F8F7` 的实体 panel 背景和原生 `NSTextView`，用纯色补偿系统 sidebar material 的视觉亮度，避免大面积 material 在居中弹窗上显脏。

### Files Modified

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`

### Verification

- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- `make check-docs`
- `git diff --check`
- Computer Use smoke: 打开记录页并点击 toolbar `+`，确认空态短文案、Add overlay 和文本输入区可进入；最终背景颜色校准后本机处于锁屏画面，截图未刷新。
