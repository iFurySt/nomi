## [2026-05-08 15:32] | Task: 调整 iOS UIUX 灰阶和系统 sheet

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### 📥 User Query

> 继续调整 UIUX：上拉窗口参考最新最佳实践修正圆角；主页和我的页统一黑白灰；统一字体、圆角等设计规范并补充 docs。

### 🛠 Changes Overview

**Scope:** `apps/ios`, `docs`

**Key Actions:**

- **System Sheet**: 去掉 upload / language sheet 外层 `.presentationCornerRadius(...)`，让 iOS 26 系统 sheet 管理外层圆角和背景；关闭按钮改用 system `ButtonRole.close` + `.glass` circle。
- **Gray Visual System**: 将 iOS 主页、My 页、语言 sheet、timeline tint 和上传 sheet 内部 surface 收敛到系统 black / white / gray 语义色，不再使用暖色、绿色、棕红或橙色主按钮主题。
- **Typography Tokens**: 增加 `NomiType`，用系统 SF / Dynamic Type text styles 管理 page title、section、card title、body、value、caption 等层级，减少固定字号和 `.rounded` 字体。
- **Language Labels**: 语言切换项改为固定目标语言显示名：`English`、`简体中文`、`繁體中文`；sheet 标题按当前选中语言显示，UI test 断言同步到明确标题文本。
- **Docs & Evidence**: 更新 UIUX / frontend / architecture 文档，并补充首页、上传 sheet、My 页、语言 sheet 的新截图证据。

### 🧠 Design Intent (Why)

iOS 26 的 sheet、tab bar、glass button 外观应尽量交给系统组件承担；自定义固定圆角和暖色 token 会和系统 Liquid Glass 视觉不一致。灰阶语义色和 Dynamic Type 让 Home / My / Upload 更接近系统 app 的默认质感，也降低后续迭代继续发散主题色的风险。

### 📁 Files Modified

- `apps/ios/NomiNative/ContentView.swift`
- `apps/ios/NomiNative/RecordsClient.swift`
- `apps/ios/NomiNativeUITests/NomiNativeUploadFlowUITests.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/UIUX_REFERENCE.md`
- `docs/generated/verification/nomi-native-gray-home-2026-05-08.png`
- `docs/generated/verification/nomi-native-system-sheet-gray-2026-05-08.png`
- `docs/generated/verification/nomi-native-gray-my-2026-05-08.png`
- `docs/generated/verification/nomi-native-gray-language-sheet-2026-05-08.png`
