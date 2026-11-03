## [2026-11-03 22:46] | Task: 文稿内嵌 Canvas 与自适应预览

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6（Codex，运行环境未提供更细型号）
- **Runtime**: Codex desktop

### 📥 User Query

> 文稿增加画布 block；复用已经实现的 Canvas，像飞书一样双击进入编辑，完成后在正文按内容自适应展示。

### 🛠 Changes Overview

**Scope:** core / UI / host / 文稿文件包与离线阅读。

- 新增 `canvas.scene`，使用相同 CanvasDocument IR，场景局部身份与全局 board 分离，禁止递归嵌入。
- 文稿加号、在下方插入及 slash 菜单可插入画布。正文展示只读预览，双击 / Enter / Space 打开同一 CanvasWorkspace，点击「完成」返回。
- 作用域适配器将画布编辑、原件和撤销交回父文稿会话；保留形状、文字、连线、对齐、分组、笔记、附件、交互实验和 AI 入口，不再维护另一个手绘编辑器。
- 复用形状 renderer 与连线几何，按摆放、自动高度与连接 / 标签范围计算预览；窄屏不撑宽文稿，编辑时自动适应当前窗口。
- 嵌套 Markdown / GenUI 源文件外置到 `canvases/<blockId>/`，单篇包携带场景原件，独立导入重映射资产引用；正文导出与离线阅读保留图示。
- 本轮原先误做的未发布手绘原型读取时转换为原生场景，保留形状 / 连线和只读旧笔迹；同步修正规格。

### 🧠 Design Intent (Why)

文稿里的画布是既有 Canvas 的独立实例，复用完整编辑行为和语义契约。正文以阅读为主，编辑器在双击后打开；保存仍只有父文稿会话这一条路径。

### ✅ Validation

- 类型检查、core / host 单测、生产构建、基础 CI 通过；场景测试覆盖原子更新、局部身份隔离、递归拒绝、附件校验、原型转换边界和导出。
- 文件包测试覆盖场景、嵌套源文件外部编辑、原件、独立导入和资产重映射。
- `node scripts/check-notes-canvas.mjs` 通过：slash / 加号、双击、原生形状移动 / 文字 / 绑定连线、完成后裁切、键盘重做、全局 board 不变、视图不写正文、重开、深浅色 / 窄屏及离线预览。
- 完整 `smoke:notes`、`smoke:canvas` 与桌面构建 smoke 通过；原生指针回归顺序运行以避免 Electron 前台焦点互相干扰。
- 实际 App 已构建重启并置前，创建体验文稿，双击原生 Canvas 新建矩形，编辑 IDEA 文字，确认重开保留及完成后正文自适应预览与已保存状态。既有资料未删除。

### 📁 Files Modified

- `packages/core/src/canvas/{document,embedded-canvas,drawing,note-export}.ts`
- `packages/host/src/{nomi-package,document-store}.ts`
- `packages/ui/src/canvas/{EmbeddedCanvasBlock,useEmbeddedCanvas,CanvasScenePreview,CanvasShapeContent,useCanvasDocument,CanvasContent}.tsx`
- `packages/ui/src/pages/{Notes,Canvas}.tsx`、文稿插入入口、离线阅读与共享 Modal。
- 场景 / 原型 / 文件包单测、`scripts/check-notes-canvas.mjs` 与对应设计文档。
