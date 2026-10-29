## [2026-10-18 23:34] | Task: 重新评估 GenUI 与原生跨端 DSL

### 用户诉求

> 检查 Open Intelligent UI 和 OpenUI，结合交互学习与 AI GenUI 重新规划。DSL 需要支持现在 React / TypeScript 的桌面实现，以及未来 iOS / Android 的独立原生实现；以温度探索器截图为具体场景。

### 改动与设计决定

- 阅读两个参考仓库的规范、parser / evaluator、组件、状态绑定、动作、HTML 扩展与跨实现 fixtures，记录检查 commit 与来源。
- 增加 InteractiveBlock 和平台中立交互 IR：状态、类型化计算、组件 / 函数版本、动作与能力。
- 明确共享协议及 conformance 而非强制共享语言 / WebView；SwiftUI / UIKit / Compose renderer 独立实现成为目标。
- 区分共享程序、个人学习状态、临时视图及显式共享参数，普通交互本地执行。
- 评估优先复用 OpenUI 前端 / 参考实现的边界，未冻结 KDL、安装新依赖或宣称完整 OpenUI 兼容。
- 制作 Temperature Explorer 静态 IR 与数值 / 事件预期样例，同步原有笔记 / 画布 / DSL 设计及产品、架构和导航。

### 验证

- `make ci` / `git diff --check` 通过。
- 静态检查 9 个视图节点、6 个无环派生定义、状态 / 动作 / 函数引用及采样上限；声明采样点共 906。
- 独立 Python 核验 5 个概率案例、5 个曲线点、2 个无效温度案例，容差 1e-9，检查归一与常量平移性质。
- 本地设计链接检查通过。没有实现或运行协议 parser / interpreter、客户端控件或跨端行为测试；参考仓库与现有应用实现未改。

### 关键文件

- `docs/design-docs/generative-interactive-content.md`
- `docs/references/openui-genui-review.md`
- `docs/design-docs/interactive-learning-example/`
- `docs/design-docs/notes-infinite-canvas.md`
- `docs/design-docs/notes-canvas-dsl.md`
- `docs/exec-plans/completed/20261018-generative-interactive-dsl.md`
