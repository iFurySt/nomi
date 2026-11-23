## [2026-11-15 18:04] | Task: 设计 HTML 交互块安全隔离与跨端运行

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 设计 HTML 交互块支持方案，重点考虑安全隔离，以及未来 Swift / Java 原生手机端和 Electron Windows / Linux 的渲染；方案不合适可以继续 DSL。

### 🛠 Changes Overview

**Scope:** 架构文档；无运行时代码或权限变更。

- 新增 HTML 隔离提案：保留 portable DSL，允许未来可选的离线 HTML 程序，明确源文件、资源清单、状态、回退与跨端边界。
- 基于 Electron、Apple WebKit 和 Android 官方文档细化专用容器、最小消息桥、来源与资源校验、网络出口和运行终止的待验证方案。
- 明确 iframe / content world / 请求拦截 / 非持久化存储各自的局限；不承诺任意 HTML 自动原生化或绝对资源隔离。
- 为后续原型列出正常交互与恶意代码验收门槛，关联架构总览与现有 v2 设计。

### 🧠 Design Intent (Why)

允许已调好的 HTML 保留表现力，同时避免每次强制转换 DSL；以独立安全验证决定各端能否开放执行，保持现有 DSL 和真实内容稳定。

### 📁 Files Modified

- `docs/design-docs/html-interactive-isolation.md`
- `docs/design-docs/interactive-content-v2.md`
- `docs/ARCHITECTURE.md`
- 本 history。

### Validation

- 查阅并在提案中引用官方平台文档。
- `make check-docs` 通过；仅文档变更，不运行 App 构建或声称隔离原型已验收。
