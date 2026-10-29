## [2026-10-18] | Task: 设计 DSL 驱动的笔记与无限画布

### 用户诉求

> 设计长笔记与无限画布：文字支持 Markdown / LaTeX，支持图片、文件与可编辑手写；macOS、iPad、iPhone 可继续编辑；坚持 DSL，让 AI 容易读取、添加和修改。用户确认第一版以完整笔记置于画布为主。

### 主要改动

- 新增整体架构与 DSL 草案，定义 Note / Block 与 Placement 分离、公开文档包、共享编辑内核及原生输入桥。
- 明确 DSL 内容快照、CRDT 并发历史、外部文件导入、崩溃恢复和新建协作身份的区别。
- 明确手写保留通用向量数据，OCR / 公式识别为有来源的派生结果；PencilKit 作为待验证候选，不宣称专有 drawing blob 已经跨端可编辑。
- 记录长文 / 数学编辑、移动端聚焦、画布渲染、个人权限、AI 语义事务与分阶段验收门槛。
- 增加静态 DSL / Markdown / 笔迹 / 合成附件样例，并同步 README、产品、架构、桌面与设计索引。

### 设计动机

先以稳定 ID、可移植内容和统一命令保证用户与 AI 可编辑，再验证跨端输入与离线合并；避免把某一画布库的内部格式当作长期契约，也避免长笔记与绘图互相限制。

### 验证与状态

- 阅读并引用 JSON Canvas、Excalidraw、BlockSuite、tldraw、Yjs、Apple、W3C、CodeMirror、KaTeX 和 KDL 一手资料。
- `make ci`、`git diff --check` 和静态样例一致性检查通过：12 个唯一语义 ID、引用、source 文件、附件 digest / 字节数、笔迹采样及本地链接。
- 纯设计与文档变更，未安装新依赖、修改应用实现或生产配置；parser、手写转换、性能与跨端同步尚待阶段 0 实验。

### 关键文件

- `docs/design-docs/notes-infinite-canvas.md`
- `docs/design-docs/notes-canvas-dsl.md`
- `docs/design-docs/notes-canvas-example/`
- `docs/exec-plans/completed/20261018-notes-canvas-design.md`
