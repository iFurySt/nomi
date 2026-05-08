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
- WWDC25 Meet Liquid Glass：https://developer.apple.com/videos/play/wwdc2025/219/
- WWDC25 Build a SwiftUI app with the new design：https://developer.apple.com/videos/play/wwdc2025/323/
- WWDC25 Get to know the new design system：https://developer.apple.com/videos/play/wwdc2025/356/
- WWDC26：https://developer.apple.com/cn/wwdc26/（截至 2026-05-08，WWDC26 已公布 2026-06-08 至 2026-06-12 举办；具体设计 session 尚未发布，当前可执行设计依据仍以 iOS 26 / WWDC25 / HIG 为准。）
- Motion：https://developer.apple.com/design/human-interface-guidelines/motion
- Color：https://developer.apple.com/design/human-interface-guidelines/color
- Typography：https://developer.apple.com/design/human-interface-guidelines/typography
- SF Symbols：https://developer.apple.com/design/human-interface-guidelines/sf-symbols
- SwiftUI Animation：https://developer.apple.com/documentation/swiftui/animation
- SwiftUI animation timing：https://developer.apple.com/documentation/swiftui/controlling-the-timing-and-movements-of-your-animations

## iOS 26 Liquid Glass 外部参考

这些参考只作为入口和实现校准，不把外部文章大段复制进仓库。遇到底部导航、floating controls、tab bar 或自定义 glass 交互时，先读本节，再动代码。

- Donny Wals - Exploring tab bars on iOS 26 with Liquid Glass：https://www.donnywals.com/exploring-tab-bars-on-ios-26-with-liquid-glass/
  - 用途：确认底部主导航优先走 SwiftUI `TabView`。iOS 26 会给系统 tab bar 自动应用 Liquid Glass；需要右侧独立 action 时，优先检查 `TabRole.search` 这类系统 role，而不是手写浮动组。
- Donny Wals - Grouping Liquid Glass components using glassEffectUnion on iOS 26：https://www.donnywals.com/grouping-liquid-glass-components-using-glasseffectunion-on-ios-26/
  - 用途：只有系统 `TabView` / toolbar / sheet 不能满足形态时，才考虑 `GlassEffectContainer`、`glassEffectUnion`、`glassEffectID` 组织多个自定义 glass shape。
- LiquidGlassSwiftUI 示例 repo：https://github.com/mertozseven/LiquidGlassSwiftUI
  - 用途：参考系统 `.glassEffect(.clear.interactive())`、`GlassEffectContainer` 和 `glassEffectID` 的组合方式。该示例不是 tab bar 替代方案，不能据此回到手画底部导航。

## 本地视觉参考

- `docs/design-docs/mobile-uiux-less-is-more/README.md`：less-is-more 方向总览。
- `docs/design-docs/mobile-uiux-less-is-more/v3-earth-morandi/`：优先参考的视觉探索，保留暖色、大地色、莫兰迪色、轻 surface 和小众设计 App 气质。
- `docs/design-docs/mobile-uiux-less-is-more/v2-consistent-system/`：一致性控制参考，尤其是 token、底部导航、卡片和多页统一导出方式。
- `docs/generated/verification/nomi-native-home-single-add-warm-2026-05-07.png`：当前原生 iOS home-only + 单 Add icon 首页截图基准。
- `docs/generated/verification/nomi-native-home-health-summary-2026-05-07.png`：当前原生 iOS 首页截图基准。
- `docs/generated/verification/nomi-native-upload-sheet-spaced-2026-05-07.png`：当前原生 iOS 上传 sheet 截图基准。
- `docs/generated/verification/nomi-native-home-sidebar-zh-2026-05-07.png`：历史原生 iOS 首页左侧 sidebar 与中文语言切换截图基准；当前 My 页语言切换已取代 sidebar。
- `docs/generated/verification/nomi-native-ios26-style-home-2026-05-08.png`：iOS 26 / WWDC25 Liquid Glass 样式统一后的首页截图。
- `docs/generated/verification/nomi-native-ios26-style-upload-sheet-2026-05-08.png`：iOS 26 / WWDC25 Liquid Glass 样式统一后的上传 sheet 截图。
- `docs/generated/verification/nomi-native-ios26-style-sidebar-zh-2026-05-08.png`：历史 iOS 26 / WWDC25 Liquid Glass 样式统一后的 sidebar 截图。
- `docs/generated/verification/nomi-native-ios26-refined-home-2026-05-08.png`：按 Contacts 风格调整右下浮动 Add 后的首页截图。
- `docs/generated/verification/nomi-native-ios26-refined-upload-sheet-2026-05-08.png`：限制单一 detent、降低 Add sheet 字号和关闭按钮后的上传 sheet 截图。
- `docs/generated/verification/nomi-native-ios26-refined-sidebar-zh-2026-05-08.png`：历史移除正文缩放 / 推动和隐藏底部 Add 后的 sidebar 截图。
- `docs/generated/verification/nomi-native-ios26-bottom-system-tabbar-2026-05-08.png`：原生 iOS 26 `TabView` Liquid Glass 底栏截图，左侧 Today / 我的为系统 tab 组，右侧 Add 使用 `TabRole.search` 分离，中间空档和选中高亮由系统处理。

## Nomi UIUX 标准

- 气质：quiet、personal、less is more、Apple-like，像私人记录本，不像医疗 dashboard、CRM、量化驾驶舱或通用 calorie tracker。
- 信息层级：首屏先给今天最重要的身体和生活记录，再给可继续记录的入口；不要让 chrome、装饰、解释文案压过数据和记录。
- 首页：Today 总览覆盖摄入 / 卡路里、蛋白质、训练、步行、久坐、睡眠等数据；timeline 低装饰、可扫描、卡片有明确间距，时间轴圆点和卡片垂直中心对齐。
- 上传：Capture / Add 是主动作，sheet 顶部保留足够安全区；Camera / Photos / Files 使用系统 picker 边界；选择多于输入。
- 底部入口：当前左侧只有 Today / 我的，右侧只有 Add；优先用原生 iOS 26 `TabView` 加 `TabRole.search` 形成左侧 tab 组和右侧独立 action。两个分组之间保留系统空档，不手画整条热区、选中胶囊或高光。
- My：当前只保留语言切换，不添加会员、邀请、隐私等占位入口；后续有真实功能再逐项补。
- Log / Trends / Ask：这些入口回归前要有真实内容和明确边界；Ask 必须有来源、有边界、不过度诊断。

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
- Tab / nav：底部双分组优先使用原生 `TabView` 的 iOS 26 Liquid Glass tab bar；需要右侧独立 action 时优先用 `TabRole.search`，不要自行手画选中 glass 胶囊、镜面高光或整组手势热区。只有确实不能用系统 tab bar 时，才用 `GlassEffectContainer` / `glassEffectUnion` 做小范围自定义。
- Sheet：优先系统 sheet，顶部留白充分，关闭按钮清晰，主动作靠底部但不遮挡内容。若当前任务没有 full-height 需求，只提供单一 detent，避免用户上拖后进入另一套更实的 full-height sheet 视觉状态。
- 圆角：优先用系统 presentation / material 承担外层裁切；iOS 26+ 新增外层浮层优先用 `ConcentricRectangle` / `.concentric(minimum:)` 保持容器同心圆角，不再为每个新 surface 随手写固定 radius。Nomi 既有半径分层可作为 minimum 语义：sheet `32`、大 panel `28`、timeline card `18`、metric tile `16`。
- Liquid Glass：优先用于 navigation / control 层，不把所有内容卡片都做成 glass。自定义 glass 控件必须显式指定 shape；icon-only 主动作优先 `.glassEffect(..., in: .circle)`，避免默认 capsule。多个 glass shape 需要融合或 morph 时放进 `GlassEffectContainer`，并控制 spacing，让相邻 shape 只在真实靠近时融合。
- Surface：内容层使用轻暖色 `surfaceLift`、细 hairline 和低阴影表达层级；主色 tint 只给 Add / Choose 等主动作，普通内容 icon 保持低饱和语义色。
- Timeline：时间在左、rail 居中、卡片在右；圆点对齐卡片垂直中心，卡片间距稳定。
- 指标卡：少量指标、明确单位、短文案；不要做复杂环形图、风险分或医疗解释。

## iOS 26 底栏实现守则

当前 Nomi 底栏是系统实现，不是自绘控件：

- 根部使用 `TabView(selection:)`。
- Today / 我的使用普通 `Tab`。
- Add 是 action，不是内容页；用 `Tab(value:role:.search)` 放到右侧独立圆形 Liquid Glass 位置。
- Add 被点中后只打开上传 sheet，并把 `selection` 回退到上一个内容 tab。
- 保留 `bottom-today`、`bottom-me`、`bottom-add` accessibility identifiers，避免 UI test 失去稳定入口。

后续改底栏时禁止先做这些事：

- 不要新增自定义 `BottomFloatingControls`、自绘 `Capsule` / `Circle` 底座、手画选中胶囊、手画镜面高光或用 overlay 模拟系统选中态。
- 不要把整条底栏或左右分组之间的空白作为可点击 / 可拖动热区。
- 不要用固定尺寸强行复刻截图里的玻璃形状；系统 tab bar 会根据设备、安全区、文字长度和 accessibility 设置自动调整。
- 不要为了让 Add 变圆而改回普通 floating button；先确认 `TabRole.search` 是否还能满足当前信息架构。

只有在以下情况才允许自定义 glass 底栏，并且需要在 history 里写明理由：

- 系统 `TabView` 无法表达产品交互，而不是仅仅因为截图看起来差一点。
- 已验证 `TabRole.search`、toolbar、`tabViewBottomAccessory` 等系统路径不满足。
- 自定义实现必须用 `GlassEffectContainer` / `glassEffectUnion` / `glassEffectID`，并让每个可交互按钮自己承载 hit target 和 `.interactive()` glass；不得用一层手画 overlay 假装系统 glass。

## 验收清单

每次可见 UI 变更至少检查：

- 截图：iPhone simulator 首页 / 关键 sheet；明显视觉改动要保存到 `docs/generated/verification/`。
- 构建：原生 iOS 运行 `xcodebuild ... build`；触及上传真实路径时运行对应 XCUITest。
- 视觉：首屏是否能看出当前任务；卡片、timeline、底栏是否有稳定间距；文字是否溢出。
- 交互：tap、drag、release、sheet dismiss、picker 边界是否符合预期。
- 动效：是否服务状态变化；是否过慢、过强或抢内容注意力。
- 边界：没有医疗诊断、风险评分、告警色、恐吓或过度承诺。
