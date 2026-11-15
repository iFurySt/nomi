# CI/CD

- `ci.yml`：仓库文档、卫生、脚本语法和 Actions SHA 固定检查。
- `desktop-release.yml`：桌面双架构签名、公证与 Sparkle 分发，见 [桌面发布](DESKTOP_RELEASE.md)。
- 个人同步后端位于 `apps/sync-server`；独立测试和本地部署已按 [完成计划](exec-plans/completed/20261115-personal-cloud-sync.md) 接入，远端发布另行配置。

旧家庭 `server-release.yml` 与 amoylab 自动部署脚本已退役，不再使用旧 `server-v*` tag 自动覆盖旧生产实例。此次不关闭远端旧服务或删除数据。旧 TestFlight 工程不再构建发布。

桌面验证：`pnpm check`、相关 `pnpm test`、`pnpm build` 和隔离 Electron 专项。`make ci` 只代表基础仓库检查，不代表全部产品验收。所有外部 Actions 固定到 commit SHA。


2026-11-15 个人同步：CI 的独立 sync-server job 运行隔离 PostgreSQL / Go race、TypeScript 同步契约 / 队列测试，以及原生包往返与新数据库配对灾备恢复。双 Electron 验收在 macOS 本机手动运行，不在 Linux job 模拟 safeStorage。Compose 部署演练入口为 `node scripts/check-sync-compose.mjs`；无远端自动部署。
