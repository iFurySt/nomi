## [2026-10-19 22:51] | Task: 预设画布内容类型体验区

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex Desktop

### 📥 User Query

> 把所有当前可放到画布的类型预设在画布上，逐个体验。

### 🛠 Changes Overview

**Scope:** `packages/ui`、画布 smoke 与产品文档。

- 追加 8 项真实样例：Markdown 长笔记、LaTeX、PNG、TXT、PDF、交互学习、混排笔记、共享内容摆放。
- 增加右上体验样例按钮及左下逐项定位；复用领域命令、撤销与附件原子事务，重复添加保留样例修改和已有文档布局。
- 混排笔记和独立卡片共享内容与交互参数，PNG / TXT / PDF 均有本机原件；PDF 不宣称内嵌编辑，未实现手写不放占位。
- 新增 3 个样例测试及真实 App 的类型、矩阵 / 推导行数、逐项定位、幂等、内容保留与刷新恢复回归。
- 已在实际桌面画布添加并保存，校对公式后刷新确认恢复，定位至第 01 项；验证截图仅使用隔离合成 profile。

### 🧠 Design Intent (Why)

让用户直接操作每类内容及复用关系，避免重置已有画布或仅展示无法编辑的静态卡片。样例沿用正式存储与命令路径，也能验证 DSL 内容与摆放分离。

### 📁 Files Modified

- `packages/ui/src/canvas/examples.ts` / `examples.test.ts`
- `packages/ui/src/pages/Canvas.tsx`
- `packages/ui/src/canvas/canvas.css`
- `scripts/check-canvas.mjs`
- `docs/design-docs/canvas-workspace-runtime.md`、`docs/DESKTOP.md`
- `docs/QUALITY_SCORE.md`、`docs/releases/feature-release-notes.md`
- `docs/exec-plans/completed/20261019-canvas-examples.md`

### 验证

`pnpm check`、`pnpm test`（257 个）、`pnpm build`、`pnpm smoke:desktop` 通过；强化公式行数断言后再次通过 `pnpm smoke:canvas` 和生产构建。PDF 经解析验证为单页 PDF 1.4，交叉引用字节偏移有效。最终 `pnpm check`、`make ci` 与 `git diff --check` 通过。
