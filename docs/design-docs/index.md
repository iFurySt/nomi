# 设计文档索引

用这个目录集中管理架构设计和产品设计文档。

建议约定：

- 一个主题一份文档。
- 每份文档写清当前状态和简短摘要。
- 关联引入它的 execution plan 或 spec。

## 初始文档

- `core-beliefs.md`
- `../UIUX_REFERENCE.md`：当前 UIUX 标准、动效规则、官方参考链接和本地设计图入口。前端可见改动优先读它。

## 笔记与无限画布

- [文稿编辑与文章导出](notes-authoring.md)：Canvas 同源 Note 的富文本 / Markdown 视图、公式、交互实验、附件、Markdown / Jekyll 包和离线阅读运行时。

- [画布主工作区实现](canvas-workspace-runtime.md)：默认 Canvas、世界坐标、长笔记、附件 / 原件、交互块、撤销与 IndexedDB 恢复。
- [连线编辑与浮动工具栏](connector-editing.md)：边界锚点吸附、端点 / 线段、标记与样式、文字、剪贴板、层级和锁定的实现契约。
- [交互学习运行时实现](interactive-learning-runtime.md)：Learn 实验、严格 IR、定义与个人进度分离、React renderer 与独立 Swift 数值 / 事件 conformance。
- [生成式交互内容与跨平台 DSL](generative-interactive-content.md)：当前修订入口，覆盖 interactive learning、AI GenUI、平台中立 IR、状态 / 计算 / 动作和原生 renderer。
- [Temperature Explorer 契约样例](interactive-learning-example/README.md)：静态 IR、参考概率与预期事件，未实现运行时。
- [OpenUI 源码评估](../references/openui-genui-review.md)：两仓库的分工、可复用边界和源码证据。

- [整体设计](notes-infinite-canvas.md)：长笔记优先，定义内容 / 摆放、DSL、跨端、手写、AI 和同步边界；状态为提案。
- [DSL 草案](notes-canvas-dsl.md)：声明式语义、文件包、Markdown / 数学、通用笔迹与版本事务。
- [格式示例](notes-canvas-example/README.md)：静态 DSL、正文、笔迹与合成附件，未接运行时。

## 桌面设计

- [迁入的桌面设计基线](desktop-design.md)：AIFi 的成熟布局、token、交互与组件参考；金融领域和品牌不是 Nomi 整体定位。
- [当前产品规格](../product-specs/personal-workbench.md) 与 [桌面开发说明](../DESKTOP.md) 定义继续开发的范围。

## 移动端设计

- `mobile-uiux-less-is-more/`：上一轮基于 Snap / Log / Review 的 less-is-more 页面设计图，当前作为视觉参考保留；现行 mobile beta 使用资料 / 对话 / 家庭结构。

- [画布选择、形状属性与布局](canvas-selection-and-layout.md)：形状 / 多选浮动栏、布局吸附、语义复制与参考交互验收矩阵。
