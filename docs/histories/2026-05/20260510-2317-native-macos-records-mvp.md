# Native macOS Records MVP

## 用户诉求

在已有 iOS 原生端之后，新增一个 macOS 版本。server 复用同一个；先做简单的记录页面和添加功能，macOS 表现形式采用左侧边栏和右侧主体。实现期间参考已有设计留档和最新 Apple 设计指导，并进行本地验证。

## 主要改动

- 新增 `apps/macos/NomiMac/` SwiftPM 原生 SwiftUI app，并提供 `scripts/build-app.sh` 生成本地 `.app` bundle、`scripts/build-dmg.sh` 生成本地 `.dmg` 方便普通 macOS 启动和分发验证。
- 使用 `NavigationSplitView` 实现 macOS 常见 sidebar + detail 结构。
- 右侧 Records 主体支持从同一个 server `GET /records` 读取记录、显示加载和连接失败状态。
- header 增加 Refresh 和 Add，Add sheet 通过 `POST /records` 写入简单文字记录。
- 将 macOS Refresh / Add 从系统 titlebar toolbar 移到内容 header 右侧，彻底避免展开 / 收起 sidebar 时右上角短暂出现系统 overflow `»` 图标。
- 新增 macOS 前端启动说明，并在架构和质量文档里登记桌面端入口。

## 设计动机

- macOS 端不复刻 iOS 底栏，优先使用 Apple 当前推荐的 sidebar 和 split view 桌面结构；Refresh / Add 不放进系统 titlebar toolbar，避免系统重排产生 overflow 闪现。
- 记录类型收敛到 server 当前 schema 允许的 `note`、`food`、`body_stats`、`document`，避免前端提交后被后端拒绝。
- 桌面端先交付可运行的记录回看和轻量添加，图片上传和更完整 UI 自动化放到后续 milestone。

## 验证

- `cd apps/macos/NomiMac && ./scripts/build-app.sh`
- `cd apps/macos/NomiMac && ./scripts/build-dmg.sh`
- 启动本地 Postgres 和 server 后，通过 Computer Use 操作 `dev.nomi.mac`：打开 Add sheet，输入一条测试记录，保存后右侧 Records 列表刷新为 `1 saved`。
- 通过 Computer Use 操作 `dev.nomi.mac` 展开 / 收起 sidebar，确认系统 toolbar 只保留 Show/Hide Sidebar，没有 `»` overflow 项；Refresh / Add 保持在内容 header。
- 视觉截图：`docs/generated/verification/nomi-macos-records-mvp-2026-05-10.png`
