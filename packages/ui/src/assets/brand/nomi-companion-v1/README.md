# Nomi · 知己相伴 / v1

用户选择的 B 方向，2026-10-19 定稿输出。左高右低的两个相伴形体保留为共享轮廓。
本目录已接入 Electron 的 Dock / bundle / window 图标、Web favicon / touch icon 和共享界面 CSS mask。
界面标志随 currentColor 自动黑白反转；现有原生 iOS 资源集尚未替换。

## 选用文件

| 场景 | 文件 |
| --- | --- |
| macOS bundle | `Nomi.icns` |
| Electron macOS Dock / window | `app-icon-macos-1024.png`，原生留白，tile 占画布 80.5% |
| Web / Windows / Linux 常规应用图标 | `app-icon-dark-512.png`，另有 64 / 128 / 256 / 1024 |
| 反转的白底黑标图标 | `app-icon-light-{size}.png` |
| iOS | `AppIcon.appiconset/` 或 `app-icon-ios-1024.png`，满版、无透明通道，系统裁圆角 |
| 浅色界面 | `symbol-black-{size}.png` 或 `symbol-black.svg`，透明底 |
| 深色界面 | `symbol-white-{size}.png` 或 `symbol-white.svg`，透明底 |
| 随主题染色 | `symbol-white-256.png` 作为 CSS mask；内联 SVG 可用 `symbol-current.svg` |
| 总览 | `preview.png` / `preview.html` |

PNG 标志尺寸：64 / 128 / 256 / 512 / 1024。黑色 sRGB #202020，白色 #FFFFFF。
黑白版本由同一个 alpha 母版机械导出，轮廓、间距、抗锯齿透明度完全共用。
SVG 是嵌入 PNG alpha mask 的可缩放容器，**不是独立矢量路径**。
CSS 使用 `background: currentColor; mask: url(symbol-white-256.png) center / contain no-repeat;`，即可跟随主题。
外部 `<img src="symbol-current.svg">` 不会继承宿主的 currentColor，需内联或使用 CSS mask。

## 再导出

在此目录执行：

```sh
swift export.swift
iconutil -c icns Nomi.iconset -o Nomi.icns
```

依赖 macOS / Swift / CoreGraphics / iconutil；正常使用交付 PNG / SVG / ICNS 无需生成工具。
`symbol-master.png` 是内置 imagegen 生成、已检查的透明 alpha 母版。
导出器只做布局、统一主题色、尺寸与格式输出，不修改母版形体。
曾生成的有边缘杂点白标稿已弃用，没有收入交付包。

## 最终母版生成提示词（内置 imagegen）

Production logo cleanup, use case logo-brand. Reference is the APPROVED Nomi concept B in the input image. Redraw only its central two-piece logo as SOLID BLACK flat vector-style shapes on a genuinely transparent square canvas. Preserve the two organic shapes and their exact arrangement: left tall rounded arch with inner curved cutout and tapered inward pointing tip, right shorter rounded vertical bean leaning inward, thin clean separation. Match the selected reference silhouette carefully. Important: use clean closed shapes, uniformly solid black interiors and perfectly smooth antialiased contours. No erasure debris, no flecks, no extra outlines, no fuzzy edges, no holes within the solid pieces, no distress or texture. Remove rounded black app tile entirely. Modest 10 percent transparent padding. This is one clean production mark, NOT a rendered material or app icon mockup. No text, gradients, highlights, shadows, bevels or additional objects.
