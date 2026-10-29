# GenUI 与跨平台交互 DSL 重新评估

## 目标与用户约束

在完整笔记、无限画布、手写与离线编辑设计之上，把交互学习和 AI 生成 UI 纳入首要架构。DSL 的长期目标是平台中立协议：桌面可用 React / TypeScript，未来 iOS / Android 能用原生 renderer 独立实现。

本轮检查本地 OpenUI 与 Open Intelligent UI 源码，评估可复用的语言 / 状态 / 组件 / 流式编辑机制，以 Temperature Explorer 为契约样例重新规划。

## 范围

仅修改设计、规格与静态样例；不修改两个参考仓库、不安装或移植运行时、不把设计样例称为已运行的应用。保留现有应用、账号与数据。

## 步骤

- [x] 阅读仓库规则、上一版设计和用户截图。
- [x] 检查两个参考仓库的语言规范、parser / evaluator、React 组件、状态绑定、动作、HTML 扩展及一致性 fixtures。
- [x] 建立平台中立的交互块、状态、计算、动作和能力模型。
- [x] 评估 OpenUI 复用边界，调整 KDL / WebView / TypeScript 的原有假设。
- [x] 编写温度探索器 IR / 参考结果和跨 renderer 验收门槛。
- [x] 同步现有设计、产品与架构入口，检查静态样例并记录本轮决定。

## 关键问题

- DSL 不能只声明视觉树，必须表达本地状态、派生计算、事件与效果边界。
- 交互程序、个人学习进度、临时 UI 状态和共享文档不是同一个同步范围。
- OpenUI 的宽容流式解析不等于可持久化文档的严格校验；其源码 patch 不等于 CRDT。
- 原生可移植必须有稳定语义 IR、组件 / 函数版本与跨语言测试，不能依赖 CSS、JS 隐式转换或任意 HTML。

## 结果与关键决定

- 新增 `generative-interactive-content.md`，将协议扩展为文档、空间、交互三个语义层；InteractiveBlock 成为一等内容。
- 修正上一版 TypeScript / WebView 优先的长期假设，原生 renderer、表达式语义与 conformance fixtures 进入阶段 0。
- OpenUI 与 Open Intelligent UI 是语言内核 / 参考应用的分工。推荐先验证受支持前端、Nomi catalog 与完整未求值 IR 的映射，未引入生产依赖。
- 区分程序定义、个人学习状态、临时视图与显式共享例题；普通拖动无需模型请求。
- 明确宽容流式预览、严格持久发布、statement patch 与协作历史的差别，以及任意 HTML / JS 的 Web 扩展边界。
- 更新旧笔记 / DSL 文档、架构、产品与入口，避免继续把 WebView 或同一编程语言列为原生客户端前提。

## 静态验证

`make ci` 与 `git diff --check` 通过。Temperature Explorer IR 检查了 9 个视图节点、6 个无环派生定义、状态 / 动作 / 函数引用及 906 个声明采样点的上限；独立 Python 数值核验 5 个概率案例、5 个曲线点和 2 个非法温度案例，概率归一与常量平移性质在 1e-9 容差内成立。本地设计链接已检查。

这些只证明静态样例与参考数值一致，不证明 IR interpreter、OpenUI compiler、React / SwiftUI / Compose renderer、网络请求数量或实际交互已经实现。本轮未修改参考仓库、安装依赖、运行模型或修改生产应用。

## 下一阶段

单独推进协议实验：Nomi catalog 与 schema、OpenUI 前端完整表达映射、TS 参考 renderer、最小 SwiftUI renderer、数值 / 事件 conformance 与个人状态恢复；随后接笔记画布和现有 AI 通道。
