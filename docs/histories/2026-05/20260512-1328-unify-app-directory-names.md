# Unify App Directory Names

## 用户诉求

用户指出 `apps/ios` 下仍有 `NomiNative` / `NomiNativeUITests` / `NomiNative.xcodeproj`，`apps/macos` 下仍有 `NomiMac`，希望统一整理目录命名。

## 主要改动

- 将 iOS 当前入口统一为 `apps/ios/Nomi/`、`apps/ios/NomiUITests/` 和 `apps/ios/Nomi.xcodeproj`。
- 将 iOS app target / UI test target / scheme 引用同步收敛为 `Nomi` 与 `NomiUITests`，测试类和入口文件同步改名为 `NomiUploadFlowUITests` 与 `NomiApp.swift`。
- 将 macOS SwiftPM app 统一为 `apps/macos/Nomi/`、`Sources/Nomi/`，并把 package / executable / target 从 `NomiMac` 收敛为 `Nomi`。
- 更新 README、架构、前端说明和 TestFlight 发布文档中的当前路径与验证命令。

## 设计动机

- 产品对外和构建产物已经统一叫 `Nomi`，源码入口继续保留 `NomiNative` / `NomiMac` 会增加导航成本。
- iOS 和 macOS 已分别由平台目录区分，不需要再在子目录名里重复 `Native` 或 `Mac`。
- 历史记录和已完成 execution plan 保留旧路径，避免改写当时事实；当前入口文档统一指向新路径。

## 受影响文件

- `apps/ios/Nomi.xcodeproj/project.pbxproj`
- `apps/ios/Nomi/`
- `apps/ios/NomiUITests/`
- `apps/macos/Nomi/`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/IOS_TESTFLIGHT_RELEASE.md`

## 验证

- `xcodebuild -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Debug -destination 'generic/platform=iOS Simulator' build`
- `xcodebuild -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Debug -destination 'generic/platform=iOS Simulator' build-for-testing`
- `cd apps/macos/Nomi && rm -rf .build && ./scripts/build-app.sh && ./scripts/build-dmg.sh`
- `make check-docs`
- `git diff --check`
- `rg -n "NomiNative|NomiMac|apps/ios/NomiNative|apps/macos/NomiMac|NomiNativeUITests|NomiNativeUploadFlowUITests" -g '!docs/histories/**' -g '!docs/exec-plans/completed/**' -g '!apps/macos/Nomi/.build/**'`
