## 2026-11-01 | Task: 紧凑图标侧栏与应用内更新进度

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop，macOS

### User Query

> 侧栏只保留图标，进一步收窄，底部头像更小。发现更新显示下载图标，点击显示圆环下载进度，下载完成后要求重启生效。

### Changes

- 外侧栏 56px、按钮 40px、头像 28px，保留名称 tooltip、无障碍标签和移动端文字导航。
- Sparkle 从标准原生窗口改用自定义 SPUUserDriver；N-API / sandbox IPC 传递阶段、真实字节进度、取消和重启意图。
- 侧栏与设置页共享状态；下载完成提示稍后 / 重启；下载失败、系统不兼容和延迟退出可重试。
- 安装点击和原生最终重启回调都等待全部文稿保存；失败暂停，避免并发安装及自动重试循环。
- 发布 CI 纳入原生 driver、IPC 保存屏障、隔离 Electron UI 测试。

### Design Intent

减少固定导航占用。更新入口平时隐藏，真实发现更新才出现。保留 Sparkle 下载、验签和安装，不接受 renderer 提供安装 URL 或文件路径。

### Files

- `apps/desktop/native/update-driver.*` / `sparkle.mm`
- `apps/desktop/src/updates.ts` / `main.ts`
- `packages/core/src/updates.ts` / `packages/platform/src/index.ts`
- `packages/ui/src/components/{Shell,ProfileMenu,UpdateIndicator}.tsx`
- `packages/ui/src/update-context.tsx` / `pages/UpdateSettings.tsx` / `styles.css`
- `scripts/check-update-{driver,host,ui}.mjs`

### Verification

- 类型检查、36 文件 / 264 单测通过。
- 原生回调、IPC 保存屏障、隔离 Electron 更新 UI 回归通过，浅深色和窄屏截图已检查。
- 生产构建、隔离桌面 smoke、本地独立 DMG 打包与 Sparkle 初始化 smoke 通过。
- 用户解锁后已完成最终构建及实际开发 App 退出重启，Computer Use 确认 Canvas / 文稿中的紧凑侧栏与窗口正常。
- 截图使用合成更新状态：[准备重启](../../generated/verification/nomi-update-ready-2026-11-01.png)、[下载进度](../../generated/verification/nomi-update-progress-2026-11-01.png)、[深色](../../generated/verification/nomi-update-ready-dark-2026-11-01.png)。
- 不改变已发布 0.1.0 制品；真正跨版本签名更新在下一次发行时验收。
