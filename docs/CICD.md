# CI/CD

- `ci.yml`：仓库文档、卫生、脚本语法和 Actions SHA 固定检查。
- `desktop-release.yml`：桌面双架构签名、公证与 Sparkle 分发，见 [桌面发布](DESKTOP_RELEASE.md)。
- 个人同步后端位于 `apps/sync-server`；独立测试与部署按 [开发计划](exec-plans/active/20261115-personal-cloud-sync.md) 接入。

旧家庭 `server-release.yml` 与 amoylab 自动部署脚本已退役，不再使用旧 `server-v*` tag 自动覆盖旧生产实例。此次不关闭远端旧服务或删除数据。旧 TestFlight 工程不再构建发布。

桌面验证：`pnpm check`、相关 `pnpm test`、`pnpm build` 和隔离 Electron 专项。`make ci` 只代表基础仓库检查，不代表全部产品验收。所有外部 Actions 固定到 commit SHA。
