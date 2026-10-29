# 2026-10-19 23:03 | Nomi 知己相伴品牌图标交付

## 用户诉求

选择 B「知己相伴」，输出 App 可用图标以及界面内黑白反转版本，参考 AIFi 的 App / 界面分工；随后要求实际替换并启动桌面 App 查看。

## 改动

- 新增交付目录 `packages/ui/src/assets/brand/nomi-companion-v1/`；后续已接入桌面构建、原生 bundle / Dock 图标、Web favicon / touch icon 和共享 UI 的主题色 CSS mask。现有原生 iOS 引用保留。
- 内置 imagegen 生成透明母版，保留两片相伴轮廓；弃用有边缘杂点的中间稿。
- 由同一 alpha 母版通过 CoreGraphics 导出 sRGB 黑 / 白透明标志、正反底色 App PNG、macOS ICNS / iconset 和 iOS 单图 AppIcon 资源集。
- 提供 64–1024 PNG、共享 PNG mask 的 SVG 容器、预览页与可重跑 Swift 导出器。SVG 不是独立矢量路径。

## 验证

- 人工检查黑底白标及反转预览，透明母版恰有两个完整形体。
- 导出器逐像素检查黑白 PNG alpha 一致、实心区域 sRGB #202020 / #FFFFFF。
- iOS 图标检查 1024 × 1024 且无 alpha 通道；macOS iconutil 打包 ICNS。
- 接入后生产构建及独立 desktop smoke 通过，覆盖 renderer / bridge / 品牌素材加载；运行时 Dock PNG 与定稿文件 SHA-256 一致。
- 正常退出旧版后重新启动 Nomi，实际窗口已显示「知己相伴」黑色界面标志，画布和已保存内容正常恢复。
- 构建使用仓库要求的 Node 24；系统默认 Node 25 因 Homebrew 动态库缺失不可用，未改动机器配置。

## 设计意图

将用户确认的 B 方向固化成可直接接入的资产包，黑白变体共用形状，避免分别生成导致轮廓漂移。
