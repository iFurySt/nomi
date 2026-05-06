# Mobile UI/UX Consistent Design System

## 用户诉求

用户指出上一版多张页面设计图之间一致性不够，尤其底部导航栏样式不统一；同时希望整体色系重新设计，并确保多张图的内容与组件规则统一。

## 本次改动

- 新增 `docs/design-docs/mobile-uiux-less-is-more/v2-consistent-system/`。
- 用单一 `index.html` 定义确定性移动端设计稿，集中管理色系、底栏、卡片、按钮、chips、趋势图和页面内容。
- 从同一 HTML/CSS 导出 5 张 `390 x 844` PNG：
  - `01-snap-empty.png`
  - `02-snap-ai-review.png`
  - `03-log.png`
  - `04-review.png`
  - `05-ask-nomi.png`
- 更新父级设计 README，标记 v2 consistent system 为后续实现优先参考版本。

## 设计动机

上一版使用生成图，适合探索方向，但不适合作为逐页实现的稳定参照。v2 改为代码化设计稿，确保每张图共用同一 palette、底栏组件、active 状态、页面宽高和卡片规则。新色系采用 paper / ink / sage / clay，整体更安静，并把主动作统一收敛到 sage。

## 验证

- 使用 Chrome headless 从同一 `index.html` 导出 PNG。
- 用 ImageMagick 裁切到统一 `390 x 844`。
- 人工检查 5 张图，确认底栏样式和色系一致。

## 受影响文件

- `docs/design-docs/mobile-uiux-less-is-more/README.md`
- `docs/design-docs/mobile-uiux-less-is-more/v2-consistent-system/README.md`
- `docs/design-docs/mobile-uiux-less-is-more/v2-consistent-system/index.html`
- `docs/design-docs/mobile-uiux-less-is-more/v2-consistent-system/*.png`
