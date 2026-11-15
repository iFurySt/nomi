# 个人文稿云同步实施

日期：2026-11-15。Agent：Codex / root。本任务跨阶段继续维护此记录。

## 用户诉求

完整实现可选个人云同步，阶段完成后提交。独立后端，移除旧家庭 server / iOS 等无用工程，用本机两个隔离客户端模拟双 Mac 验收。

## 阶段 0：清理旧产品路径

移除旧 `apps/server`、`apps/ios`、`apps/macos`、`infra/amoylab` 和旧自动发布 workflow。只删除 Git 管理的源码 / 配置，历史保留，未访问或清理远端数据、凭据或正式 App。更新架构、入口、安全与 CI 文档，归档旧 TestFlight 计划。新服务使用 `apps/sync-server` 独立模块 / 数据库。

验证：基础 CI 与 diff 检查；该阶段没有运行时产品改动。

## 阶段 1：个人同步内核

新增独立 `apps/sync-server`，显式校验和迁移，Cobra migrate / create-user / serve，bcrypt 与可撤销设备会话。实体版本检查、批次事务、稳定水位、幂等收据、tombstone、历史与固定快照；Markdown 原文独立 text。新增隔离 PostgreSQL 自动测试脚本和 CI job。

验证：真实 PostgreSQL 18 + Go race 测试通过，涵盖双 HTTP 会话、不同块并发、同块冲突、原子拒绝、重试 / request ID 复用、no-op、Markdown 存储、删除恢复、并发成环、事务游标与分页、过期游标、账号隔离、设备撤销 / 过期与登录限流。附件和桌面尚未接入，不将内核测试作为完整目标验收。
