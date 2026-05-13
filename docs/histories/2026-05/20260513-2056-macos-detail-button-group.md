# macOS detail preview button group

## 用户诉求

记录页点开右侧预览时，顶部需要类似 Notion 的按钮组：一个往右收起预览，一个保留当前放大入口。

## 改动

- macOS 右侧记录详情顶部图片上的单个放大按钮改为两个 icon 按钮组成的紧凑按钮组。
- 新增收起预览按钮，点击后清空当前选中记录并关闭右侧详情栏。
- 保留放大预览按钮入口，按钮视觉保持黑白灰、轻 surface 和小圆角风格。

## 验证

- `cd apps/macos/Nomi && ./scripts/build-app.sh`

## 影响文件

- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
