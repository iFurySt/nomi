## 2026-11-08 12:59 | Task: 点击下载后自动重启更新

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop，macOS

### 用户诉求

更新过程只保留下载图标与顺时针进度；点击后下载，完成直接重启，不再弹确认框。

### 变更与动机

- Host 为本次下载记录自动重启意图，解包完成后先保存所有窗口，再继续 Sparkle 安装。原生最终退出仍执行保存屏障。
- 取消、下载失败或开始安装即消耗该意图；保存失败暂停，退出超时不循环重试，保留明确恢复操作。
- 侧栏不再自动打开就绪确认；正常过程保持下载圆环 / 准备旋转状态。错误才打开提示；原生重试清除上次失败文案。
- 原有检查时间表、签名校验与开发版禁用更新保持不变。

### 主要文件

- `apps/desktop/src/updates.ts`
- `apps/desktop/native/update-driver.mm`
- `packages/ui/src/components/UpdateIndicator.tsx`
- `scripts/check-update-host.mjs`、`scripts/check-update-ui.mjs`
- `docs/DESKTOP_RELEASE.md`、`docs/UIUX_REFERENCE.md`

### 验证

- `pnpm check`、`pnpm build` 通过；构建仍有既有大 chunk 提示。
- Host、UI、原生 driver 三项更新回归通过，覆盖自动推进、全窗口保存、取消 / 失败、并发去重、退出重试与既有检查时间表。
- 已查看隔离 UI 的下载 / 安装截图，正常流程无确认弹层。
- 已确认开发版保存，退出并重启 Nomi(Dev)，实际检查 General 更新设置。开发版保持禁用自动更新，未操作正式版。
- 本次未发布，也未执行真实跨版本签名安装；回归使用隔离 bridge / 原生回调，不等同完整升级验收。
