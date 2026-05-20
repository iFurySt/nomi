## [2026-05-20 13:51] | Task: macOS records sync refresh

### Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### User Query

> 记录数据被外部清空后，macOS app 切换页面仍显示旧数据；需要处理后续多端数据同步问题。

### Changes Overview

**Scope:** `apps/macos/Nomi`, `docs`

**Key Actions:**

- **Records refresh triggers**: macOS app 在启动、app 回到前台、进入概览 / 记录页时重新拉取 server records。
- **Periodic sync**: app 停留在概览 / 记录页时每 15 秒静默同步一次 records，避免多端或外部操作后继续显示旧状态。
- **Docs sync**: 更新架构和质量评分文档，记录桌面端 records 基础同步刷新能力。

### Design Intent (Why)

records 的权威状态在 server。macOS 端之前只在启动、当前 app 新增或当前 app 删除后刷新，无法感知其他端或外部 API 操作。加入前台、切页和轻量轮询刷新后，现阶段不引入复杂实时通道也能覆盖本地开发和多端基础一致性需求。

### Files Modified

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/ARCHITECTURE.md`
- `docs/QUALITY_SCORE.md`
