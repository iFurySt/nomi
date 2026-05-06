# Mobile UI/UX Earth Morandi Iteration

## 用户诉求

用户反馈第一版更大气、更有设计感，第二版一致但视觉偏弱；希望重新整理并输出一版暖色调、大地色调、莫兰迪色调的页面设计。

## 本次改动

- 新增 `docs/design-docs/mobile-uiux-less-is-more/v3-earth-morandi/`。
- 用同一个 HTML/CSS 设计系统输出 5 张统一规格页面设计图：
  - `01-snap-empty.png`
  - `02-snap-ai-review.png`
  - `03-log.png`
  - `04-review.png`
  - `05-ask-nomi.png`
- 将 palette 调整为 `paper / surface / cocoa / clay / olive / rose`，整体转向暖色、大地色、莫兰迪低饱和色。
- 更新父级 README，将 v3 标为后续实现优先参考版本。

## 设计动机

v3 保留 v1 的大标题、大留白、中心视觉物和更强的产品截图感，同时延续 v2 的确定性导出方式，避免底栏、组件和内容在多张图之间漂移。底部导航仍固定为 `Snap / Log / Review`，Ask Nomi 作为 Review 信息架构内的独立页。

## 验证

- 使用 Chrome headless 从同一 `index.html` 导出 PNG。
- 使用 ImageMagick 裁切为统一 `390 x 844`。
- 人工检查 5 张图，确认色系、底栏和主要组件一致。

## 受影响文件

- `docs/design-docs/mobile-uiux-less-is-more/README.md`
- `docs/design-docs/mobile-uiux-less-is-more/v3-earth-morandi/README.md`
- `docs/design-docs/mobile-uiux-less-is-more/v3-earth-morandi/index.html`
- `docs/design-docs/mobile-uiux-less-is-more/v3-earth-morandi/*.png`
