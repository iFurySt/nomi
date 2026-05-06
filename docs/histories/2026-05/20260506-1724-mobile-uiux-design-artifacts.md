# Mobile UI/UX Design Artifacts

## 用户诉求

希望基于现有代码和参考应用风格，输出一版更简化、低 effort、无需教学即可使用的移动端页面设计图，并放到当前仓库里，方便后续逐页改造。

## 本次改动

- 新增 `docs/design-docs/mobile-uiux-less-is-more/`，保存 5 张移动端页面设计图。
- 按当前代码和后续实现粒度拆分为 Snap 空态、Snap AI review 态、Log、Review、Ask Nomi。
- 新增设计图索引文档，说明每张图的功能对应关系和实现备注。
- 更新 `docs/design-docs/index.md`，将该设计资产目录纳入设计文档索引。

## 设计动机

这版设计收敛到主动作、少量可编辑 chips、月历回看、轻趋势和有来源问答，避免教学文案、医疗 dashboard、风险评分和过密信息。它延续 `docs/DESIGN.md` 的 quiet / personal / less-is-more 方向，并服务后续按页面逐步改造 `apps/mobile/App.tsx`。

## 受影响文件

- `docs/design-docs/mobile-uiux-less-is-more/README.md`
- `docs/design-docs/mobile-uiux-less-is-more/01-snap-empty.png`
- `docs/design-docs/mobile-uiux-less-is-more/02-snap-ai-review.png`
- `docs/design-docs/mobile-uiux-less-is-more/03-log.png`
- `docs/design-docs/mobile-uiux-less-is-more/04-review.png`
- `docs/design-docs/mobile-uiux-less-is-more/05-ask-nomi.png`
- `docs/design-docs/index.md`
