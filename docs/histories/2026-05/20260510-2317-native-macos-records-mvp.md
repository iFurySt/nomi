# Native macOS Records MVP

## 用户诉求

在已有 iOS 原生端之后，新增一个 macOS 版本。server 复用同一个；先做简单的记录页面和添加功能，macOS 表现形式采用左侧边栏和右侧主体。实现期间参考已有设计留档和最新 Apple 设计指导，并进行本地验证。

## 主要改动

- 新增 `apps/macos/NomiMac/` SwiftPM 原生 SwiftUI app。
- 使用 `NavigationSplitView` 实现 macOS 常见 sidebar + detail 结构。
- 右侧 Records 主体支持从同一个 server `GET /records` 读取记录、显示加载和连接失败状态。
- toolbar 增加 Refresh 和 Add，Add sheet 通过 `POST /records` 写入简单文字记录。
- 新增 macOS 前端启动说明，并在架构和质量文档里登记桌面端入口。

## 设计动机

- macOS 端不复刻 iOS 底栏，优先使用 Apple 当前推荐的 sidebar、toolbar 和 split view 桌面结构。
- 记录类型收敛到 server 当前 schema 允许的 `note`、`food`、`body_stats`、`document`，避免前端提交后被后端拒绝。
- 桌面端先交付可运行的记录回看和轻量添加，图片上传和更完整 UI 自动化放到后续 milestone。

## 验证

- `cd apps/macos/NomiMac && swift build`
