## [2026-11-07 16:01] | Task: 统一 Sparkle 更新检查时机

### Execution Context

- Agent: `/root`
- Runtime: Codex desktop

### User Query

启动 30 秒检查一次，运行期间每小时检查；重新获得焦点或休眠恢复且距上次检查超过一小时立即补查，手动检查不受时间限制。

### Changes

- Electron host 统一调度启动、周期、焦点 / 激活与休眠恢复检查，实际发起检查时记录时间；手动检查更新同一个时间戳并重置下一次周期。
- Sparkle 原生桥增加后台检查入口，关闭内建调度。自动检查开关首次迁移已有偏好，之后独立持久化，保留关闭自动检查的用户选择。
- 自动检查遵守开关和原生会话忙碌状态，手动检查绕过时间与自动开关；退出时清理定时器及事件监听。
- 模拟时钟回归覆盖边界、连续唤醒 / 焦点去重、开发版禁用、手动检查及退出清理；同步桌面发布文档。

### Files

- `apps/desktop/src/updates.ts`
- `apps/desktop/native/sparkle.mm`
- `scripts/check-update-host.mjs`
- `docs/DESKTOP_RELEASE.md`

### Validation

`pnpm check`、`pnpm build`、host 调度 / 保存门禁回归、Sparkle 原生 driver 回归和桥接代码编译检查通过。仅保存并重启 Nomi(Dev)，实际窗口正常载入；开发版继续禁用自动更新。未运行正式版在线检查或真实跨版本安装，原生偏好迁移本次以代码与编译检查验证。
