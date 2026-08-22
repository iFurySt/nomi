# 功能发布记录

## 2026-08

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-08-23 | 家庭健康 private beta | 家庭成员可各自在 iPhone 登录，共享同一家庭健康资料库，上传报告后自动得到结合长期上下文的分析，并可继续追问。 | 新增家庭账号/一次性邀请/成员档案、全局鉴权、FS workspace + Postgres projection、持久异步 job、SeedX/Codex 资料整理与带引用对话，以及新的 SwiftUI 资料/对话/家庭流程。 |

## 2026-05

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-05-20 | Server 图片识别 | 线上 server 与用户机器上的 SeedX daemon 不共享文件系统时，图片识别仍能通过公网 HTTPS 图片资产跑通。 | 新增 `NOMI_PUBLIC_BASE_URL` / `--public-base-url`，生产环境向 SeedX 发送 `/images/...` 绝对 URL 和 size/hash 元数据，由 SeedX 0.2.1 在本机 materialize；amoylab 上传目录改为可写持久化卷；本地同机开发保留 `localImage` fallback。 |

## 2026-04

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-04-08 | 模板仓库 | 提供了一套可直接用于新项目启动的 Agent-first 基础模板。 | 补齐了 AGENTS 入口、execution plan、history、release note、CI/CD 和供应链安全骨架。 |
