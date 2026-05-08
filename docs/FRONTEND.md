# 前端协作说明

当前前端只有一个版本化移动端实现路径：

- `apps/ios/`：原生 SwiftUI iOS app，是 mobile 体验的主推进方向。

## 原生 iOS 本地启动

```sh
xcodebuild -project apps/ios/NomiNative.xcodeproj \
  -scheme Nomi \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=<simulator-udid>' \
  build

xcrun simctl install <simulator-udid> \
  ~/Library/Developer/Xcode/DerivedData/NomiNative-*/Build/Products/Debug-iphonesimulator/Nomi.app
xcrun simctl launch --terminate-running-process <simulator-udid> dev.nomi.native
```

上传 sheet 截图验证可用 simulator-only 环境变量打开初始 sheet：

```sh
SIMCTL_CHILD_NOMI_OPEN_UPLOAD=1 \
  xcrun simctl launch --terminate-running-process <simulator-udid> dev.nomi.native
```

## 当前界面

- Native iOS Home：顶部是 Today 总览，覆盖摄入能量、剩余卡路里、蛋白质、力量训练、步行、久坐和睡眠等今日数据，并从真实 timeline items 派生；初始状态不填假数据，空 timeline 不显示 `Timeline 0` 标题行，只保留居中的 Add 动作。存在记录后显示低装饰的时间轴 rail + 紧凑 timeline 卡片，弱化彩色块和大图标。底部暂时只有一个居中的圆形 Liquid Glass Add icon，轻点打开上拉上传 sheet；Log / Trends / Me 已从当前入口移除，避免空页面和解释文案占据产品界面。左上角圆形 Liquid Glass icon 打开 sidebar，sidebar 当前只保留用户名和语言切换行。
- Native iOS Upload Sheet：提供 Camera / Photos / Files 三个来源，并使用系统 sheet 背景、detents、drag indicator 和统一圆角半径。Photos 使用 `PhotosPicker`，Files 使用 SwiftUI `fileImporter`，选择图片后通过 `POST /ai/extract-image` 取得 AI metadata，再用 title、input category、confidence、nutrition / activity metadata 写入本地 timeline 和 server `/records`；app 下次启动通过 `GET /records` 恢复 timeline。Simulator 上 Camera 暂为 unavailable placeholder。
- Native iOS Language：首次启动根据 iOS 语言自动写入一个实际语言值；之后 sidebar 只提供 English / 中文 两个显式选项，不再提供跟随系统选项。语言选择通过 `@AppStorage` 持久化，并用 SwiftUI locale 立即更新界面。当前本地化资源覆盖 `en` 与 `zh-Hans`，包括 `Localizable.strings` 与照片权限 `InfoPlist.strings`。

## 设计约束

- 设计方向以 `docs/DESIGN.md` 为准：quiet、personal、less is more、Apple-like；具体 UIUX、动效、底栏、timeline 和参考链接见 `docs/UIUX_REFERENCE.md`。
- 当前视觉保留暖纸背景、大留白和轻卡片，但产品功能已收口到 upload-only。
- iOS 26 Liquid Glass 控件优先用系统 glass APIs；自定义 icon-only 控件显式指定圆形 shape，sidebar / 浮层优先使用同心圆角能力，避免默认 capsule 误包裹工具按钮。
- 优先使用系统感强的排版、清晰留白、克制色彩、图标按钮和选项控件；上传流里尽量让用户选择而不是输入，解释性文案默认删减。
- 不使用医疗 dashboard、告警、风险评分、红黄警示或诊断 / 治疗文案。
- Capture 是主动作；Ask 需要保持有来源、有边界的个人记录助手语气。

## 验收方式

- 触及图片 AI extraction contract 时，额外运行 `cd apps/server && go test ./...`，并在 server 启动后用 Photos / Files 两类来源各打一张本地图片到 `POST /ai/extract-image`，确认返回 `schema_version`、`input_category`、`output_impacts` 和 nutrition / activity metadata。
- 触及原生 iOS UI 时，至少运行 `xcodebuild ... build`，安装到目标 simulator，截图检查首页和关键 sheet。当前原生 iOS 截图：`nomi-native-home-single-add-warm-2026-05-07.png`、`nomi-native-home-health-summary-2026-05-07.png`、`nomi-native-upload-sheet-spaced-2026-05-07.png`、`nomi-native-upload-sheet-refined-2026-05-07.png`、`nomi-native-real-upload-empty-2026-05-07.png`、`nomi-native-real-upload-files-2026-05-07.png`、`nomi-native-record-reload-2026-05-07.png`、`nomi-native-home-sidebar-zh-2026-05-07.png`。
- 触及原生 iOS upload / AI path 时，优先跑真实 iOS Simulator UI test，覆盖底栏 Add、上拉上传 sheet、系统 PhotosPicker、系统 fileImporter、Upload 按钮和 Today timeline 插入。先准备素材：`xcrun simctl addmedia <simulator-udid> <photo-path>`；Files 测试还需要把图片复制到 `com.apple.DocumentsApp` 的 `group.com.apple.FileProvider.LocalStorage/File Provider Storage/`。命令：`xcodebuild test -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,id=<simulator-udid>' -only-testing:NomiNativeUITests/NomiNativeUploadFlowUITests`。
- 原生 iOS 仍保留 simulator-only `NOMI_E2E_AUTO_UPLOADS=1` 作为低层 runtime / contract smoke：先把 `nomi-e2e-uploads.json` 和图片复制到 app Documents，再 launch app；结果写入 app Documents 的 `nomi-e2e-results.log`，每行应包含 `NOMI_E2E_UPLOAD_RESULT ok <source> <file> 2026-05-07.inputs-outputs.v1 <category> <title> <confidence>`。它不能替代真实 picker UI test。
- 有明显视觉改动时，生成或保留截图证据到 `docs/generated/verification/`，并在 history 里记录命令。本轮 upload-only 重做截图：`mobile-upload-redesign-idle-2026-05-06.png`、`mobile-upload-redesign-menu-2026-05-06.png`、`mobile-upload-redesign-processing-2026-05-06.png`、`mobile-upload-redesign-review-2026-05-06.png`、`mobile-upload-redesign-menu-refined-2026-05-06.png`、`mobile-upload-redesign-simulator-tuned-2026-05-06.png`。悬浮玻璃底栏截图：`mobile-floating-glass-nav-idle-2026-05-07.png`、`mobile-floating-glass-nav-menu-2026-05-07.png`。

## 测试策略

当前原生 SwiftUI app 有独立 UI test target 覆盖 Photos / Files 真实 picker 上传到 Today timeline，并有 `NOMI_DISABLE_RECORD_SYNC=1` 用于让 picker 测试不受本地 server 历史记录影响。后续应把 record reload、真实模型 adapter、camera capture 真机链路和 timeline filtering 升级为更完整的自动化测试。
