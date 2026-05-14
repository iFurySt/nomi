# macOS profile settings popover

## 用户诉求

头像下拉需要改成类似参考图里的面板式入口，但当前暂时只需要“设置”一项，并且视觉要契合 Nomi 的整体 UIUX。

## 改动

- macOS sidebar 顶部头像入口从系统 `Menu` 改为自定义 `popover`。
- popover 内只保留一个“设置”入口，带 gear 图标和简短说明。
- 面板使用白色 surface、细边框、小圆角和轻阴影，继续保持 Nomi 的黑白灰、低装饰风格。
- 点击“设置”后进入当前“我的”区域并收起 popover。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
