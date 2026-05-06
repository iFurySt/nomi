# Nomi Mobile UI/UX v3 Earth Morandi

这版回到 v1 更大气、更有设计感的方向，同时保留 v2 的一致性控制：所有页面仍由同一个 `index.html` 和同一套 CSS tokens 导出。

## 方向

- 暖色调、大地色调、莫兰迪色调。
- 更大标题、更强留白、更像小众设计导向 App 的产品截图。
- 卡片更轻，层级更少，Capture / Snap 仍是主动作。
- 底部导航、active 状态、卡片、chips、按钮和色系在所有页面保持一致。

## Palette

| Token | Color | 用途 |
| --- | --- | --- |
| `paper` | `#F3E8DA` | 暖纸色 App 背景。 |
| `surface` | `#FFF9EF` | 主要卡片与浮层。 |
| `ink` | `#221B16` | 主文字。 |
| `muted` | `#8D7D6E` | 次级文字。 |
| `line` | `#E1CFBB` | 边框和分割线。 |
| `cocoa` | `#8F624F` | 主动作、导航 active、重点 chips。 |
| `clay` | `#BD7D61` | 辅助强调。 |
| `olive` | `#737B61` | 趋势和身体记录辅助色。 |
| `rose` | `#D2A39B` | 备用柔和辅助色。 |

## 设计图

| 文件 | 页面 / 状态 |
| --- | --- |
| `01-snap-empty.png` | Snap 空态 |
| `02-snap-ai-review.png` | Snap AI review |
| `03-log.png` | Log |
| `04-review.png` | Review |
| `05-ask-nomi.png` | Ask Nomi |

## 导出

```sh
cd docs/design-docs/mobile-uiux-less-is-more/v3-earth-morandi
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=390,930 \
  --screenshot=_tmp-01-snap-empty.png "file://$PWD/index.html?screen=snap-empty"
magick _tmp-01-snap-empty.png -crop 390x844+0+0 +repage 01-snap-empty.png
```
