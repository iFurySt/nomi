# UIUX 参考与标准

这份文档用于把 Nomi 的移动端 UIUX、动画和视觉参考沉淀成可复用入口。后续只要改首页、上传、底部导航、timeline、趋势、Log、Ask 等用户可见界面，都先按需读这里，再回到具体实现。

## 参考优先级

1. `docs/DESIGN.md`：产品气质和不可违背的设计原则。
2. 本文：把原则翻译成移动端 UIUX、动效和验收标准。
3. `docs/FRONTEND.md`：当前技术实现、启动和截图验证方式。
4. `docs/design-docs/`：历史视觉探索和截图参考，不代表必须照抄的信息架构。
5. Apple 官方 Human Interface Guidelines：当系统交互、布局、动效、材料、颜色、字体和 SF Symbols 有疑问时，以官方文档为准。

## 官方参考链接

- Apple HIG 总入口：https://developer.apple.com/design/human-interface-guidelines/
- Sheets：https://developer.apple.com/design/human-interface-guidelines/sheets
- Modality：https://developer.apple.com/design/human-interface-guidelines/modality
- Layout：https://developer.apple.com/design/human-interface-guidelines/layout
- Materials / Liquid Glass：https://developer.apple.com/design/human-interface-guidelines/materials
- Motion：https://developer.apple.com/design/human-interface-guidelines/motion
- Color：https://developer.apple.com/design/human-interface-guidelines/color
- Typography：https://developer.apple.com/design/human-interface-guidelines/typography
- SF Symbols：https://developer.apple.com/design/human-interface-guidelines/sf-symbols
- SwiftUI Animation：https://developer.apple.com/documentation/swiftui/animation
- SwiftUI animation timing：https://developer.apple.com/documentation/swiftui/controlling-the-timing-and-movements-of-your-animations

## 本地视觉参考

- `docs/design-docs/mobile-uiux-less-is-more/README.md`：less-is-more 方向总览。
- `docs/design-docs/mobile-uiux-less-is-more/v3-earth-morandi/`：优先参考的视觉探索，保留暖色、大地色、莫兰迪色、轻 surface 和小众设计 App 气质。
- `docs/design-docs/mobile-uiux-less-is-more/v2-consistent-system/`：一致性控制参考，尤其是 token、底部导航、卡片和多页统一导出方式。
- `docs/generated/verification/nomi-native-home-health-summary-2026-05-07.png`：当前原生 iOS 首页截图基准。
- `docs/generated/verification/nomi-native-upload-sheet-spaced-2026-05-07.png`：当前原生 iOS 上传 sheet 截图基准。

## Nomi UIUX 标准

- 气质：quiet、personal、less is more、Apple-like，像私人记录本，不像医疗 dashboard、CRM、量化驾驶舱或通用 calorie tracker。
- 信息层级：首屏先给今天最重要的身体和生活记录，再给可继续记录的入口；不要让 chrome、装饰、解释文案压过数据和记录。
- 首页：Today 总览覆盖摄入 / 卡路里、蛋白质、训练、步行、久坐、睡眠等数据；timeline 低装饰、可扫描、卡片有明确间距，时间轴圆点和卡片垂直中心对齐。
- 上传：Capture / Add 是主动作，sheet 顶部保留足够安全区；Camera / Photos / Files 使用系统 picker 边界；选择多于输入。
- 底部导航：保持较小暖色悬浮 glass bar；Add 是普通导航项，不是突兀特例；按住左右滑动时只预览高亮，松手才确认 tab 或打开 Add。
- Log / Trends / Ask：Log 偏记录回看，Trends 偏温和复盘，Ask 必须有来源、有边界、不过度诊断。

## Visual Tokens

当前视觉可以从 v3 earth morandi 和原生实现里提炼为以下方向，不要求每个新组件硬编码同一组值，但要保持语义一致：

| Token | 方向 | 用途 |
| --- | --- | --- |
| Paper | 暖纸色 / 极浅暖中性 | App 背景和大面积留白。 |
| Surface | 近白、轻透明 | 卡片、sheet、浮层。 |
| Ink | 接近黑但不纯黑 | 主标题、关键数值。 |
| Muted | 暖灰 / 中性灰 | 次级说明、时间、未激活导航。 |
| Sage / Olive | 低饱和绿色 | 身体记录、可信、恢复、timeline 点。 |
| Clay / Cocoa | 暖棕红 | Add、少量强调、当前动作。 |
| Gold | 柔和辅助色 | 能量、卡路里等少量状态。 |

用色要求：

- 颜色只表达关系和状态，不制造紧迫感。
- 不使用红黄告警体系、健康风险色、强对比医疗感。
- 不靠颜色单独传达含义，必须配合文本、图标或位置。
- 避免单一色相铺满页面；暖色、绿色、中性灰需要有平衡。

## Layout 标准

- iPhone 优先，尊重 safe area、Dynamic Island 和底部手势区域。
- 内容宽度、卡片宽度和底栏宽度要有稳定约束，不靠内容撑开。
- 卡片之间必须有可见间距；列表项不要上下贴住。
- 时间轴、日志、指标等重复元素要优先服务扫描，不做过多装饰。
- 控件不嵌套在多层卡片里；页面 section 更像内容区域，卡片只用于记录、指标、sheet 内工具或 modal。
- 文本不得互相遮挡，不得溢出按钮、卡片和导航项；长文案优先压短，其次 `lineLimit` / `minimumScaleFactor`。

## Motion 标准

- 动效只用于反馈、空间关系和状态变化，不为了炫技。
- 优先使用 SwiftUI 系统动画、`spring` / `smooth` / `bouncy`、`matchedGeometryEffect`、`symbolEffect` 和系统 sheet 交互。
- 导航高亮、底栏拖动、上传 sheet、图片选择、进度变化要有轻微触觉感；动画时间一般控制在 `0.2s - 0.55s`。
- 拖动交互必须跟手：拖动只预览，松手才确认的场景要清楚区分 preview state 和 committed state。
- 避免循环大幅动画、过强缩放、闪烁、过量渐变、无意义漂浮装饰。
- 重要状态不能只靠动画表达，要有文本、图标或 haptic 的替代反馈。

## 组件规则

- 图标：原生 iOS 优先使用 SF Symbols；保持线性、轻量、一致 stroke。
- 按钮：明确命令使用文字或 icon+text；工具按钮优先 icon，并保证可访问 label。
- Tab / nav：active 状态用轻 glass pill / matched geometry 流动，不使用大黑胶囊、强阴影或突兀圆形 FAB。
- Sheet：优先系统 sheet，顶部留白充分，关闭按钮清晰，主动作靠底部但不遮挡内容。
- 圆角：优先用系统 presentation / material 承担外层裁切；sheet 不再叠自绘背景顶到边框。Nomi 当前半径分层为 sheet `32`、大 panel `28`、timeline card `18`、metric tile `16`，新组件先复用语义层级，不单点随意调半径。
- Timeline：时间在左、rail 居中、卡片在右；圆点对齐卡片垂直中心，卡片间距稳定。
- 指标卡：少量指标、明确单位、短文案；不要做复杂环形图、风险分或医疗解释。

## 验收清单

每次可见 UI 变更至少检查：

- 截图：iPhone simulator 首页 / 关键 sheet；明显视觉改动要保存到 `docs/generated/verification/`。
- 构建：原生 iOS 运行 `xcodebuild ... build`；触及上传真实路径时运行对应 XCUITest。
- 视觉：首屏是否能看出当前任务；卡片、timeline、底栏是否有稳定间距；文字是否溢出。
- 交互：tap、drag、release、sheet dismiss、picker 边界是否符合预期。
- 动效：是否服务状态变化；是否过慢、过强或抢内容注意力。
- 边界：没有医疗诊断、风险评分、告警色、恐吓或过度承诺。
