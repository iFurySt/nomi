## [2026-05-20 14:23] | Task: macOS records as home with empty drop import

### Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### User Query

> macOS 首页改成记录页；记录页为空时支持把多个图片和文件拖进去自动导入识别。

### Changes Overview

**Scope:** `apps/macos/Nomi`, `docs`

**Key Actions:**

- **[Default route]**: macOS app 启动默认选中“记录”，不再先进入“概览”。
- **[Empty-state drop import]**: 全局无记录时，记录页空态本身成为可拖拽导入区，支持一次拖入多个 file URL。
- **[Batch extraction]**: 拖入文件会逐个调用现有 `RecordsClient.extractImage(fileURL:)`，复用 server `/ai/extract-image` contract；完成后刷新 records，失败时显示轻量错误。
- **[Docs sync]**: 更新架构、前端和质量评分文档，记录默认首页与空态拖拽导入行为。

### Design Intent (Why)

桌面端的首屏应直接服务 capture / review，而不是先停在概览。空记录页是用户最自然的导入目标，把多文件拖拽挂到空态上可以减少首次使用摩擦，同时继续复用既有 Add overlay 和 server extraction contract，避免新增一套上传路径。

### Files Modified

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
