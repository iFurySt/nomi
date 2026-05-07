# 前端协作说明

当前前端有两个移动端实现路径：

- `apps/ios/`：新的原生 SwiftUI iOS app，是后续 mobile 体验的主推进方向。
- `apps/mobile/`：迁移前的 React Native + Expo + TypeScript 原型，仍保留 domain smoke 和历史 UI 验证入口。

第一阶段先以 mobile app 为主；原生 iOS 用 iPhone Simulator 验证，Expo web 仍可作为旧原型的快速截图面。

## 原生 iOS 本地启动

```sh
xcodebuild -project apps/ios/NomiNative.xcodeproj \
  -scheme NomiNative \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=<simulator-udid>' \
  build

xcrun simctl install <simulator-udid> \
  ~/Library/Developer/Xcode/DerivedData/NomiNative-*/Build/Products/Debug-iphonesimulator/NomiNative.app
xcrun simctl launch --terminate-running-process <simulator-udid> dev.nomi.native
```

上传 sheet 截图验证可用 simulator-only 环境变量打开初始 sheet：

```sh
SIMCTL_CHILD_NOMI_OPEN_UPLOAD=1 \
  xcrun simctl launch --terminate-running-process <simulator-udid> dev.nomi.native
```

## 本地启动

```sh
cd apps/mobile
npm install
npm run typecheck
npm run smoke
npx expo start --web --port 8081
```

如果要清理 Metro cache：

```sh
cd apps/mobile
npx expo start --web --port 8081 --clear
```

## 当前界面

- Native iOS Home：顶部是全局总览玻璃卡片，下面是时间轴 rail + 紧凑记录卡片；底部是较小的暖色悬浮玻璃导航栏，中央 `+` 打开上拉上传 sheet，选中 tab 使用滑动玻璃底托过渡。Trends / Log / Me 暂时是占位 tab。
- Native iOS Upload Sheet：提供 Camera / Photos / Files 三个来源，并为 sheet 顶部标题和关闭按钮保留额外上边距。Photos 使用 `PhotosPicker`，Files 使用 SwiftUI `fileImporter`，选择图片后可通过 Upload 写入本地 timeline；Simulator 上 Camera 暂为 unavailable placeholder。
- Upload Workbench：默认主入口。底部导航是悬浮玻璃胶囊，中央是圆形主按钮，点开后三个来源按钮按拍摄、相册、文件的顺序用 `Animated.stagger` 顺时针展开；点击 X、点击菜单外区域或选择任一来源都会收起菜单。
- Source pickers：拍摄和相册使用 `expo-image-picker`，文件使用 `expo-document-picker`，当前限制为 image 文件，面向 iPhone 上传路径。
- Upload processing：选择图片后进入上传处理态，显示旋转处理动画、原图已选择、AI 分类已推断、cutout 处理中三步状态。
- Review result：只展示原图、AI 分类、cutout 单独资产位和 Upload 动作。保存后写入本地 records；当前仍是本地内存数据，尚未接入 server persistence。
- iOS cutout：`apps/mobile/src/native/imageCutout.ts` 优先调用本地 Expo module `NomiImageCutout`；该 module 位于 `modules/nomi-image-cutout/`，iOS 17+ 走 Vision foreground instance mask 输出透明 PNG。Expo web / 未包含 custom module 的 Expo Go 只展示 native unavailable 状态；真实 cutout 需要 iOS development build / prebuild，且图片需要能被 Vision 识别出前景主体。

## 设计约束

- 设计方向以 `docs/DESIGN.md` 为准：quiet、personal、less is more、Apple-like。
- 当前视觉保留暖纸背景、大留白和轻卡片，但产品功能已收口到 upload-only。
- 优先使用系统感强的排版、清晰留白、克制色彩、图标按钮和选项控件；上传流里尽量让用户选择而不是输入，解释性文案默认删减。
- 不使用医疗 dashboard、告警、风险评分、红黄警示或诊断 / 治疗文案。
- Capture 是主动作；Ask 需要保持有来源、有边界的个人记录助手语气。

## 验收方式

- 每个 UI milestone 至少运行 `npm run typecheck`。
- 触及 domain flow 或 AI boundary 时运行 `npm run smoke`。
- 需要启动 Expo web 并检查关键屏幕能渲染和切换。
- 触及原生 iOS UI 时，至少运行 `xcodebuild ... build`，安装到目标 simulator，截图检查首页和关键 sheet。当前原生 iOS 截图：`nomi-native-home-bottom-plus-timeline-2026-05-07.png`、`nomi-native-upload-sheet-spaced-2026-05-07.png`。
- 有明显视觉改动时，生成或保留截图证据到 `docs/generated/verification/`，并在 history 里记录命令。本轮 upload-only 重做截图：`mobile-upload-redesign-idle-2026-05-06.png`、`mobile-upload-redesign-menu-2026-05-06.png`、`mobile-upload-redesign-processing-2026-05-06.png`、`mobile-upload-redesign-review-2026-05-06.png`、`mobile-upload-redesign-menu-refined-2026-05-06.png`、`mobile-upload-redesign-simulator-tuned-2026-05-06.png`。悬浮玻璃底栏截图：`mobile-floating-glass-nav-idle-2026-05-07.png`、`mobile-floating-glass-nav-menu-2026-05-07.png`。
- 触及 native module 时，至少运行 `npx expo-modules-autolinking resolve --platform ios --json` 确认模块进入 iOS pods，并用 `npx expo run:ios --device <simulator-udid>` 做 simulator 编译 / 加载 smoke。
- 触及 iOS upload 入口时，可在本地 prebuild 目录跑 `xcodebuild test -workspace ios/Nomi.xcworkspace -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=<simulator-udid>' -only-testing:NomiTests/NomiUploadFlowUITests`，覆盖 FAB 菜单、camera unavailable 反馈、Files picker、Photos picker、Files 选文件后 review / Upload 保存路径和 Photos 选图后 review / Upload 保存路径。`apps/mobile/ios/` 当前是 generated / ignored 目录，UITest target 需要随 prebuild 产物维护；Photos 选图测试依赖 simulator 照片库已有可选图片，并且 Photos 系统引导页已关闭；Files 选文件测试依赖在 `com.apple.DocumentsApp` 的 `group.com.apple.FileProvider.LocalStorage/File Provider Storage/` 内预置 `nomi-upload-test.png`，可用 `xcrun simctl listapps <simulator-udid>` 找到该 app group 后复制 `apps/mobile/assets/icon.png`。iOS Simulator 没有真实 camera capture 设备，本地自动化只能验证 camera 入口的授权 / unavailable 反馈；camera-source review / Upload 保存逻辑可用 `com.anonymous.nomi://e2e/upload-camera-review` deep link fixture 单独验证，触发后运行 `xcodebuild test ... -only-testing:NomiTests/NomiUploadFlowUITests/testCameraDeepLinkFixtureCanBeUploaded`。真实拍照后 review / Upload 全链路仍需要真机验证。

## 测试策略

当前 mobile app 有 TypeScript 检查、domain smoke、iOS upload 入口 XCUITest 和手工 / 截图 smoke。后续应把 capture store、AI boundary、camera capture 真机链路和 timeline filtering 升级为更完整的自动化测试。
