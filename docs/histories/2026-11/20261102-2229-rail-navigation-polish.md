## 2026-11-02 | Task: 侧栏导航拖拽与账户图标

### User Query

> 禁止导航按住拖动时出现 file:// 拖影；文稿放到 Canvas 上方；更换左下角账户图标。

### Changes

- 主导航与设置分类链接禁用 HTML 原生拖拽，并取消 dragstart；导航 SVG 同时禁用 WebKit 拖拽。文稿树排序行为不变。
- 桌面及移动端导航统一调整为文稿、Canvas 顺序。
- 未登录账户入口替换为灰色圆底与实心人像，保留紧凑尺寸、主题色和已登录首字显示。
- 同步桌面说明与架构中的导航顺序。

### Validation

- `pnpm check`、`pnpm build`、`node scripts/check-notes-navigation.mjs` 通过。
- 确认已保存后正常退出、重新启动本地 App；通过 computer use 截图确认导航顺序和账户图标，保留原选中文稿且未改动正文。

### Main files

- `packages/ui/src/components/Shell.tsx`
- `packages/ui/src/components/SettingsSidebar.tsx`
- `packages/ui/src/components/ProfileMenu.tsx`
- `packages/ui/src/styles.css`
