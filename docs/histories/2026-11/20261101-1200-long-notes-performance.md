## [2026-11-01 12:00] | Task: 建立长文性能基线并优化输入热路径

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6（运行环境未提供更细型号）
- **Runtime**: Codex desktop / 本地终端 / Electron / Computer Use

### 📥 User Query

> 超长文稿混合各种内容块仍需保持高性能，进行实际性能测试和优化。

### 🛠 Changes Overview

**Scope:** core 文本事务、UI 文稿编辑器与块定位、独立 Electron 性能工具。

- 新增约 20 万字符连续长文和 120 块混排样本、CPU profile / 输入帧 / 滚动 / 打开 / 保存重开报告；独立测量实际 `.nomi` 文件包，不触碰用户文稿。
- `set_markdown` 使用结构共享，保留完整校验、原子失败、不可变撤销快照；其他命令路径保持全量拷贝。
- 编辑器稳定回调与 memo、交互程序引用快速比较、block 索引，减少兄弟内容的重复工作。
- 输入时暂停隐藏 gutter 的全文 DOM 定位；回归发现首次鼠标移回需按实际行恢复，已修正并跑通完整 Notes 流程。
- 写入可检索性能契约、测量原始数据、后续瓶颈和容量边界。

### 🧠 Design Intent (Why)

优先消除 CPU profile 中的重复工作，保持输入法、原生选择、Markdown 往返和保存语义。当前阶段不引入可能破坏编辑正确性的全文虚拟化，也不将单机响应代理指标表述为物理显示延迟或跨机保证。

### 📁 Files Modified

- `packages/core/src/canvas/document.ts` / `document.test.ts`
- `packages/ui/src/writing/RichMarkdownEditor.tsx` / `RichBlockFrame.tsx` / `writingRows.ts`
- `packages/ui/src/canvas/InteractiveBlock.tsx`
- `scripts/profile-notes.mjs` / `scripts/fixtures/notes-performance.tsx`
- `docs/design-docs/notes-performance.md` / `docs/generated/performance/`

### 验证

423 单测与类型检查通过。生产构建、完整 Notes 与 IME Electron 回归通过。性能数字与未解决边界见设计文档；所有压力数据都在独立 profile / library，未写入真实资料库。实际窗口验证了混排滚动、交互实验参数变化、文稿切换和长文中段中文粘贴。

Canvas 回归、基础 CI 和 diff 卫生检查通过。正式 Nomi 已确认保存后正常退出、重启最新构建并置于前台，文稿页恢复此前选中文稿；未编辑真实用户正文。
