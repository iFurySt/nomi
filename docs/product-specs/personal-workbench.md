# Nomi / 知己：个人一站式工作台

状态：2026-10-18 确认的当前产品方向。本文取代早期 body log 和仅家庭健康的整体产品定位；历史文档仍可用于理解既有实现。

## 定位与价值

Nomi 是个人一站式工作台，帮助一个人把分散的信息、记录和长期上下文持续积累起来，让 AI 在真实资料上完成整理、关联、检索、理解与行动支持。家庭成员是个人工作台的自然扩展，用户不必先有家庭场景才有使用价值。

中文名“知己”和英文名 Nomi 保留，表达对自己的持续理解。产品介绍可使用：

> Nomi / 知己，连接学习、笔记、信息、知识、健康与财富的个人一站式工作台，并可扩展到家庭成员。

英文描述：

> Nomi is a personal workbench for learning, notes, information, knowledge, health and wealth management, with optional family collaboration.

## 领域

| 领域 | 用户目的 | 当前状态 |
| --- | --- | --- |
| 学习 | 形成学习计划、消化资料、积累理解 | 已有 Learn 交互块、温度探索器与独立本机进度；完整学习流程待开发 |
| 笔记 | 记录想法、整理内容、持续编辑 | 已有画布内 / 聚焦 Markdown 与 LaTeX 编辑，图片 / 文件 / 交互块，本机 IndexedDB 保存；手写和跨端待开发 |
| 信息 hub | 汇聚来源、筛选、跟进重要信息 | 通用搜索及继承的金融来源可复用；通用收集箱待开发 |
| 知识 | 把记录和来源连接成可查询的长期上下文 | server 已有家庭资料归档、摘要与引用；跨领域知识体验待扩展 |
| 健康 | 整理个人及家人的报告与历史资料 | iOS / server 已有资料与对话 beta；健康是其中一个领域 |
| 财富管理 | 理解资产、研究、回顾决策 | 桌面继承股票研究、观察列表、组合示例和虚拟 Arena；真实资产账户聚合、账本与完整财富管理待开发 |
| 家庭扩展 | 为家人维护资料，按需共享与协作 | server 已有家庭 / 成员 scope；桌面尚未接入，个人私有与共享权限需另行设计 |

## 下一阶段重点

优先推进 DSL 驱动的笔记与无限画布：完整长笔记可在画布中组织，支持 Markdown / LaTeX、图片、文件、可编辑手写与交互学习组件。macOS、iPad、iPhone 与未来 Android 共享平台中立文档 / 交互语义，允许分别用 React、SwiftUI / UIKit、Compose 实现；移动端可以展开同一篇笔记继续编辑，iPad 需要验证 Pencil 输入。

用户已确认长笔记优先。整体模型采用内容与摆放分离；当前 [画布实现](../design-docs/canvas-workspace-runtime.md) 已支持 Document / Note / Block / Placement、长笔记、附件、交互块与本地恢复。[交互运行时](../design-docs/interactive-learning-runtime.md) 包含 TS / Swift 数值 / 动作验证。文件化 DSL / KDL、完整附件包、手写、离线合并、原生移动编辑和同步仍按 [整体设计](../design-docs/notes-infinite-canvas.md)、[DSL 草案](../design-docs/notes-canvas-dsl.md) 与 [GenUI 修订](../design-docs/generative-interactive-content.md) 推进。

## 当前交付

桌面基于 AIFi 的 Electron + React + Node host + Go 本地数据服务继续开发，优先继承已经迭代好的交互与 ChatGPT / Codex 基础设施。迁入基线上新增默认 Canvas、长笔记 / 附件 / 交互块与本地恢复；原金融功能暂时保留，后续逐项决定保留、改造或删除。

移动端继续保留 iOS 家庭资料 private beta。桌面的本地 ChatGPT 连接与 server 的 SeedX/Codex 路径独立；暂未实现统一账号、统一资料或同步。通用助手不得声称已读到尚未接入的笔记、健康或家庭资料。

## 产品原则

- 从个人价值出发，再扩展到家庭；领域增加不等于首屏塞满入口。
- 信息、原始来源、用户记录和 AI 推断保留清楚的边界。
- 尽量复用共同的收集、整理、检索、引用和对话能力，按真实任务增加领域能力。
- 界面安静、紧凑、容易扫描；沿用迁入桌面的交互质量和 iOS 的系统习惯。
- 不把规划中的模块或示例数据写成已完成能力。
- 个人私有资料与家庭共享必须显式划分；现有 beta 的全家庭可见规则不自动推广到所有个人数据。

## 本轮非目标

不做全领域模块开发、跨端数据迁移、真实交易、公开 SaaS、自助计费或发布。健康资料整理不提供诊断、处方或急症判断；继承的 Arena 仅为虚拟模拟，不执行真实交易。
