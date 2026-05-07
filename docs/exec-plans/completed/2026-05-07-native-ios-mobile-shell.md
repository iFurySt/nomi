# 原生 iOS Mobile Shell

## 目标

把 Nomi 的 mobile 体验从 React Native 原型开始迁移到可运行的原生 SwiftUI iOS app，先完成首页和上传上拉页两个核心页面，并保留可复现的 simulator 验证证据。

## 范围

- 包含：SwiftUI app scaffold、首页全局总览、紧凑今日 timeline、底部导航栏中央 `+` 触发的上传 sheet、Photos / Files 选择边界、占位 tab、Liquid Glass 风格视觉与动画、截图验证和文档同步。
- 不包含：server persistence、真实 AI 分类、真机 camera capture、完整 UI test target。

## 背景

- 相关文档：`docs/ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/DESIGN.md`。
- 相关代码路径：`apps/ios/`、`docs/generated/verification/`。
- 已知约束：目标 simulator 是 iPhone 17 Pro / iOS 26.3；Xcode 26.3 可用；当前 Expo iOS prebuild 目录是 ignored generated output，不作为原生迁移的版本化基础。

## 风险

- 风险：Liquid Glass API 依赖 iOS 26 SDK，低版本不可运行。
- 缓解方式：将原生 target deployment target 设为 iOS 26.0，并通过本机 Xcode 26.3 / iPhone 17 Pro simulator build 验证。

- 风险：初期上传只写入本地 state，尚未形成真实数据持久化。
- 缓解方式：文档明确当前边界，下一阶段接入 record store / server persistence。

## 里程碑

1. 调研 Liquid Glass / Apple design guidance 并确定 SwiftUI 原生实现。
2. 创建 versioned native iOS project，完成两个页面。
3. 在 iPhone 17 Pro simulator build / install / launch，截图检查首页和上传 sheet。
4. 同步架构、前端、质量和 history 文档。

## 验证方式

- 命令：`xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme NomiNative -configuration Debug -destination 'platform=iOS Simulator,id=8239FF81-AFE7-4453-9263-F4D9A5BC63E9' build`
- 手工检查：安装并运行 `dev.nomi.native`，用 `xcrun simctl io ... screenshot` 生成首页与上传 sheet 截图。
- 观测检查：最新截图保存在 `docs/generated/verification/nomi-native-home-bottom-plus-timeline-2026-05-07.png` 和 `docs/generated/verification/nomi-native-upload-sheet-spaced-2026-05-07.png`。

## 进度记录

- [x] 确认 Expo generated iOS 目录不可作为版本化原生基础。
- [x] 创建 `apps/ios/NomiNative.xcodeproj` 和 SwiftUI app source。
- [x] 实现首页、上传 sheet、占位 tab、动画和 iOS 26 glass styling。
- [x] 完成 simulator build / install / launch / screenshot 验证。
- [x] 同步 docs 与 history。

## 决策记录

- 2026-05-07：新建 `apps/ios/`，不复用 `apps/mobile/ios/`。原因是后者是 Expo prebuild generated / ignored output，不适合作为原生 SwiftUI app 的长期版本化边界。
- 2026-05-07：优先使用系统 `NavigationStack`、SwiftUI sheet、`PhotosPicker`、`fileImporter` 和 iOS 26 glass modifiers；底部主导航用自定义暖色小 glass bar 承载中央上传入口。原因是目标风格要求 Apple-like / Liquid Glass，同时上传主动作需要稳定停留在拇指区中央，chrome 不能压过内容。
- 2026-05-07：将上传主入口从顶部导航栏迁到自定义底部栏中央，并将首页 timeline 改为时间 rail + 紧凑卡片。原因是移动端核心动作更适合拇指区，视觉密度也更接近目标参考图。
- 2026-05-07：底部栏只参考位置关系，不复刻参考图黑色大胶囊；回到 Nomi 既有暖色玻璃、轻阴影和 matched-geometry 选中态流动。原因是 Nomi 的设计方向是 quiet / content over chrome。
- 2026-05-07：底栏交互改为整条 bar 的连续拖拽命中，不再由孤立 Button 分别处理 tab；拖过 tab 时实时切换并给 selection haptic，中央 `+` 只有从 `+` 起手轻点释放才打开上传。原因是恢复原型里按住左右滑动的流动交互，同时避免滑过主按钮误触上传。
