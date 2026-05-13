# macOS Native Toolbar And Sidebar Spacing

## 用户诉求

用户指出 macOS 右上角搜索和添加 icon 不像系统 Calendar 的圆形原生按钮，左侧 sidebar item 两侧 padding 过大，并且展开 sidebar 时右上角 `>>` overflow icon 会一闪而过；要求参考 `tmp/references` 里的原生代码排查根因。

## 主要改动

- 参考 `tmp/references/LandmarksBuildingAnAppWithLiquidGlass` 的 toolbar 写法，去掉搜索 / Add toolbar button 上自定义的 `frame`、`contentShape(Circle())` 和 `.buttonStyle(.plain)`。
- 搜索 / Add 改用 macOS 26 原生 `.buttonStyle(.glass)` 和 circle border shape，让按钮由系统 titlebar / toolbar 负责原生圆形玻璃效果。
- 去掉 toolbar glass button 上的透明 tint，让系统 / primary 图标颜色正常显示，避免按钮收起后短暂变成空白圆形。
- 删除把 `Spacer` 放进 `ToolbarItem` 的假间距写法；这是 sidebar 展开时 toolbar 短暂出现 `>>` overflow 的主要风险点。
- 曾尝试把右侧搜索、展开后的 `NSSearchField` 和 Add 收进单个 trailing toolbar 容器；后续实测发现只要搜索 / Add 仍是 `NSToolbar` item，就可能被系统在 sidebar 宽度变化时纳入 overflow 计算。
- 随后改为右侧 `NSTitlebarAccessoryViewController`，并用固定 intrinsic size 的 AppKit 容器承载 SwiftUI 搜索 / Add actions，让搜索 / Add 不再进入 `NSToolbar`。
- 搜索和 Add 改为纯 `Image(systemName:)` icon button 并显式设置 accessibility label，避免文本式 icon-only `Button` 在 titlebar accessory 中参与错误的 intrinsic size 计算。
- 用户复查截图后发现 `>>` 仍会在窗口中部闪现，说明系统 `navigationTitle` / sidebar toggle 仍可能触发 `NSToolbar` overflow；最终移除系统 toolbar title 和系统 sidebar toggle，改用左侧 `NSTitlebarAccessoryViewController` 承载 sidebar toggle 与当前标题。
- `NavigationSplitView` 改为绑定 `columnVisibility`，左侧自定义 sidebar toggle 直接在 `.all` / `.detailOnly` 间切换，不再依赖 AppKit responder chain 或系统 toolbar item。
- 收窄 sidebar profile、navigation rows 和 settings row 的 list row inset，减少 sidebar item 两侧空白。

## 设计动机

- macOS toolbar 的圆形按钮和 Liquid Glass 背景应交给系统控件处理，手动套 plain button、固定 frame 和 content shape 会破坏官方按钮形态。
- titlebar action 不应交给会自动 overflow 的 `NSToolbar`；对会随 sidebar 动画挤压的 action，直接放到 titlebar accessory，按钮形态仍交给系统 `.glass`。
- 如果要定位这类问题，macOS 没有 DOM console；优先看 Accessibility tree / System Events 里的 `toolbar` 元素，`>>` 本质是 `NSToolbar` 自动添加的 overflow button。
- sidebar item 的选中背景需要接近 Landmarks / Calendar 的列表密度，过大的 row inset 会让左侧栏显得空。

## 受影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/FRONTEND.md`

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- `cd apps/macos/Nomi && ./scripts/build-dmg.sh`
- 用 Computer Use 打开 `.build/Nomi.app` 后确认窗口只有系统 titlebar / toolbar，没有内容层自定义顶部栏。
- 用 Computer Use 点击 sidebar toggle 收起 / 展开，展开后 `NSToolbar` 仍只有系统 `Show Sidebar` / `Hide Sidebar`。
- 用 Computer Use 点击搜索按钮，确认搜索框以原生 `NSSearchField` 出现在右侧 titlebar accessory，Add 仍保留为独立 icon button。
- 中间复查构建后用 System Events 轮询 sidebar 折叠 / 展开过程：`AXToolbar` 只包含 `Show Sidebar` / `Hide Sidebar` 一个系统按钮，搜索和 Add 出现在独立 titlebar accessory group 中；但用户截图证明系统 sidebar toggle / title 仍会触发中部 `>>` 闪现。
- 最终复查构建后用 System Events 轮询自定义 sidebar toggle 折叠 / 展开过程：`AXToolbar` 的 button count 始终为 `0`；`AXSplitGroup` 在 sidebar 收起时从 3 个子元素变成 1 个，展开后恢复 3 个；搜索点击后出现 1 个 text field，Add 点击后出现“添加记录” overlay。
