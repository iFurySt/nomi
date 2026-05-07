## [2026-05-06 20:57] | Task: mobile iOS upload smoke

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### 📥 User Query

> 在已启动 iOS 模拟器、server 和 daemon 的环境里加载最新版 app，测试录入功能。

### 🛠 Changes Overview

**Scope:** `apps/mobile`, `modules/nomi-image-cutout`, `docs`

**Key Actions:**

- **[iOS build]**: 用当前源码重新 `expo run:ios` 到 iPhone 16e simulator，确认 app 可加载。
- **[Native module linking]**: 修复 `nomi-image-cutout` Expo autolinking 配置，新增 iOS podspec，让 `NomiImageCutout` 进入 simulator build pods。
- **[Upload smoke]**: 手工验证 upload FAB、相册 picker、processing、review fallback，并保存 simulator 截图到 `docs/generated/verification/`。
- **[Upload domain coverage]**: 将上传分类、cutout note、review 保存 record 组装抽出到 `src/domain/upload.ts`，并加入 smoke 覆盖 camera / library / file 来源映射。
- **[iOS upload UITest]**: 在本地 generated iOS project 里补 `NomiUploadFlowUITests`，覆盖 FAB 菜单、camera unavailable 反馈、Files picker、Photos picker、Files 选文件后 review / Upload 保存路径、Photos 选图后 review / Upload 保存路径，以及 deep link fixture 下的 camera-source review / Upload 保存路径。
- **[Camera fixture]**: 显式注册 `com.anonymous.nomi` scheme，并支持 `com.anonymous.nomi://e2e/upload-camera-review` 将 camera-source fixture 推进到 review 状态，用于验证 Simulator 无真实 camera 时的 camera-source 保存逻辑。
- **[Accessibility labels]**: 为 review 的 Reset / Upload action 增加稳定 accessibility label，让 iOS UI 测试和 VoiceOver 都能定位操作按钮。
- **[Fallback copy]**: 将 cutout 失败文案从 web-only 表述改成 iOS / web 都成立的 unavailable 表述，并保留开发日志；camera picker 抛错时展示 simulator / device unavailable 反馈。

### 🧠 Design Intent (Why)

Simulator smoke 暴露出 native cutout module 没有实际链接到 iOS build，导致真实 dev build 仍走 unavailable 分支。修复 autolinking / podspec 后，模块能编译进 app；同时把 Vision 无主体、Expo Go / web、native module 缺失这些失败路径的用户文案收敛为不误导的 fallback。

### ✅ Verification

- `curl http://localhost:8088/health`：server health OK。
- `cd apps/mobile && npm run typecheck`：通过。
- `cd apps/mobile && npm run smoke`：通过。
- `cd apps/mobile && npx expo run:ios --device D10AC0D3-B19A-49BB-B570-33AD8CF3C0BF`：iPhone 16e simulator 编译、安装、加载通过。
- `cd apps/mobile/ios && pod install`：安装 `NomiImageCutout (0.1.0)`。
- `cd apps/mobile && npx expo-modules-autolinking resolve --platform ios --json`：确认 `nomi-image-cutout` / `NomiImageCutout` 进入 iOS resolve 结果。
- Simulator 手工路径：确认 idle、FAB menu、相册 picker、processing、review fallback、camera permission prompt。
- Domain smoke：覆盖 upload source 分类、file 保存为 document、camera 保存为 food AI extract、original / cutout asset 状态写入。
- iOS XCUITest：常规 `NomiUploadFlowUITests` 7 条通过，其中 deep link fixture 用例在未预打开 link 时 skip；其余用例覆盖 upload FAB menu、camera unavailable 反馈、Files document picker、Photos picker、Photos 选图到 review 后点击 Upload 并确认 saved badge +1、Files 选中预置 `nomi-upload-test.png` 到 review 后点击 Upload 并确认 saved badge +1。
- Camera-source fixture：先用 `xcrun simctl openurl` 打开 `com.anonymous.nomi://e2e/upload-camera-review`，再单跑 `testCameraDeepLinkFixtureCanBeUploaded`，确认 camera-source review 点击 Upload 后 saved badge +1。

### ⚠️ Remaining Gaps

- 相册路径已能选图进入 review，但本轮没有拿到稳定主体样张让 Vision 返回 `ready` cutout；真实输出仍需补一张明确前景主体样张。
- Camera 在 iOS Simulator 中无真实拍摄设备，已覆盖授权后 `launchCameraAsync` 抛错时的 unavailable 反馈，并通过 deep link fixture 覆盖 camera-source review / Upload 保存逻辑；真实拍照后返回 asset 的系统 camera 全链路仍需要真机验证。
- Photos 选图测试依赖 simulator 照片库有可选图片，且 Photos 系统引导页已关闭；本轮用 `xcrun simctl addmedia` 和一次性 XCUITest 关闭引导页后跑通。
- Files 选文件测试依赖 simulator 的 Files app 本地 provider 内存在 `nomi-upload-test.png`；本轮通过 `xcrun simctl listapps` 定位 `group.com.apple.FileProvider.LocalStorage` 后复制 `apps/mobile/assets/icon.png` 跑通。

### 📁 Files Modified

- `apps/mobile/App.tsx`
- `apps/mobile/app.json`
- `apps/mobile/src/domain/domainSmoke.test.ts`
- `apps/mobile/src/domain/upload.ts`
- `apps/mobile/src/native/imageCutout.ts`
- `apps/mobile/ios/NomiTests/NomiUploadFlowUITests.swift`（generated / ignored iOS project，本地验证用）
- `modules/nomi-image-cutout/expo-module.config.json`
- `modules/nomi-image-cutout/ios/NomiImageCutout.podspec`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
