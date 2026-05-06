# Nomi Mobile UI/UX v2 Consistent System

这版用于修正上一版生成图的漂移问题：所有页面都从同一个 `index.html`、同一组 CSS tokens 和同一个底部导航组件导出。

## 色系

| Token | Color | 用途 |
| --- | --- | --- |
| `paper` | `#F5F2EB` | App 背景，偏纸感的暖中性。 |
| `surface` | `#FFFDF8` | 主要卡片和浮层。 |
| `ink` | `#181916` | 主要文字。 |
| `muted` | `#827E74` | 次级文字和未激活图标。 |
| `line` | `#E2DBCF` | 轻描边与分割线。 |
| `sage` | `#496F5D` | 主动作、底栏 active、可信和记录感。 |
| `clay` | `#B76E55` | 少量强调和趋势辅助色。 |
| `gold` | `#C9A24D` | 备用辅助色，避免单色系。 |

## 设计图

| 文件 | 页面 / 状态 | 说明 |
| --- | --- | --- |
| `01-snap-empty.png` | Snap 空态 | 低 effort 拍照入口。 |
| `02-snap-ai-review.png` | Snap AI review | 添加图片后的快速确认页。 |
| `03-log.png` | Log | 月历、今日摘要、最近记录。 |
| `04-review.png` | Review | 轻趋势和记录组合。 |
| `05-ask-nomi.png` | Ask Nomi | 有来源的个人记录问答。 |

## 一致性约束

- 底栏固定为 3 tab：`Snap / Log / Review`，同一尺寸、同一位置、同一 active pill。
- 页面宽高固定为 `390 x 844`，便于后续对齐 Expo mobile 实现。
- 所有卡片使用同一套 `surface / line / shadow / 8px radius`。
- 主动作统一使用 `sage`，`clay` 只做少量强调。
- Ask Nomi 仍归属于 Review 信息架构，底栏 active 保持 Review。

## 导出方式

```sh
cd docs/design-docs/mobile-uiux-less-is-more/v2-consistent-system
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=390,930 \
  --screenshot=_tmp-01-snap-empty.png "file://$PWD/index.html?screen=snap-empty"
magick _tmp-01-snap-empty.png -crop 390x844+0+0 +repage 01-snap-empty.png
```

本目录的 PNG 均按上述方式从同一个 HTML 文件导出。
