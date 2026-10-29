## [2026-10-19 22:30] | Task: 把主界面落实为无限画布

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6（Codex）
- **Runtime**: Codex desktop，本地工作区

### 📥 User Query

> 整体界面需要画布，为什么现在不是？

用户此前已明确完整笔记放在无限画布里；上一轮只交付交互 DSL 实验室，没有落实主界面。此次纠正实现范围，直接把 Canvas 设为默认入口。

### 🛠 Changes Overview

**Scope:** Document / Canvas 内核、本机存储、React 主工作区、附件 / 交互块、默认路由、验证与文档。

- 实现平台中立 Document / Note / Block / Placement / Asset IR，严格校验与基准 revision、原子文档命令、世界坐标转换。
- 默认 Canvas 提供平移、指针锚定缩放、选择、标题拖动、调宽、内容定位、共享内容的多个摆放、移出后放回、撤销重做；重叠时选中卡片置顶以保留手柄可达性。
- 长笔记支持原始 Markdown / GFM、受限 LaTeX、画布内编辑与聚焦编辑 / 预览；不维护一份会反向覆盖 Markdown 的富文本内容。
- 图片 / 文件可选取、拖入、粘贴到笔记；原件与元数据同一 IndexedDB 事务保存，校验长度与 SHA-256。SVG / HTML 按附件处理，不执行内容；CSP 仅为本机图片预览增加 blob:。
- 温度探索器作为 InteractiveBlock 可放进画布或 Note；个人状态按 profile / document / block / program 组织，同块的多个摆放同步参数。
- 结构 / 原件与本机 camera / study state 分开；配额失败、旧写入与损坏文档均显式处理。附件事务失败后撤销 / 重做继续保留尚未落盘的原件。
- 文档 DSL 支持严格编辑应用和结构快照导出；明确不含二进制原件 / 学习参数，不宣称已交付完整备份包、KDL 前端或同步。
- 保留既有金融与 Learn 页面，股票回归 fixture 显式进入 stocks；构建版 smoke 同时验证默认 Canvas 和已有功能。

### 🧠 Design Intent (Why)

无限画布是产品工作空间，交互学习只是其中一种内容。语义内容与空间摆放分离，使人、AI 和未来原生客户端可以操作相同对象。此次先完成可实际试用并恢复的本机闭环，不把截图布局、KDL 静态样例或计算 conformance 当作完整画布交付。

### 📁 Files Modified

- `packages/core/src/canvas/`
- `packages/platform/src/canvas.ts`、`canvas.test.ts`
- `packages/ui/src/pages/Canvas.tsx`、`packages/ui/src/canvas/`
- `packages/ui/src/App.tsx`、`components/Shell.tsx`、`workspace-context.tsx`、`packages/core/src/workspace.ts`
- `apps/web/vite.config.ts`、`apps/desktop/src/main.ts`
- `scripts/check-canvas.mjs`、`scripts/fixtures/canvas.tsx`、`scripts/fixtures/ui-continuity.tsx`
- `package.json`、`packages/ui/package.json`、`pnpm-lock.yaml`
- `docs/design-docs/canvas-workspace-runtime.md`、相关产品 / 架构 / 安全文档

### ✅ Validation

- `pnpm check`；`pnpm test`：47 个文件、254 个测试通过，本轮新增 16 个内核 / 附件测试。
- `pnpm build`、`pnpm smoke:desktop`：构建版默认 Canvas、旧交互连续性、Learn 与画布完整回归通过。
- `pnpm smoke:canvas`：真实 Electron 鼠标拖动 / 调宽 / 平移、缩放、长笔记 / 数学、聚焦、图片粘贴、附件原件、共享摆放 / 参数、撤销重做、坏 DSL、配额恢复、待写附件的撤销重做、旧写入拒绝、profile 隔离、刷新恢复与损坏文档保护；零网络请求。
- `pnpm smoke:navigation`、`pnpm smoke:account`；格式、仓库 CI 与 diff whitespace 检查通过。
- 人工检查合成桌面、深色和窄屏截图；真实 Nomi App 刷新后已切到 Canvas，确认画布与“已保存到本机”可见；之前 Learn 参数仍保留。

### 后续边界

完整文件化 DSL / 附件包、手写 / Pencil、原生移动编辑器、CRDT 与云同步、AI 生成 / 增量编辑工具、回收站与彻底删除尚待实现。没有修改家庭 beta 的权限、服务或发布状态。
