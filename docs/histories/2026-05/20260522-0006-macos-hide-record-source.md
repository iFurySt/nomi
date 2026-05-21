## [2026-05-22 00:06] | Task: Hide macOS record source label

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### 📥 User Query

> 不需要展示“来自本机文件”这类记录来源文案，去掉展示。

### 🛠 Changes Overview

**Scope:** macOS SwiftUI records UI

**Key Actions:**

- **[Hide source label]**: Removed the record-list source text so `macos-file` no longer appears as “来自本机文件” in the UI.
- **[Keep data contract]**: Left server-side `source` persistence and metadata unchanged for debugging and audit context.

### 🧠 Design Intent (Why)

Upload provenance is useful as internal record metadata, but it is noisy in the primary records list and does not help users scan health records.

### 📁 Files Modified

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
