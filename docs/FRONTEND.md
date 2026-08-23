# iOS 协作说明

当前唯一产品客户端是 `apps/ios/` 的原生 SwiftUI iPhone App。旧 macOS body-log 客户端不在家庭健康 V1 范围内。

## 信息架构

- 未登录：邮箱密码登录；首次 owner 用 bootstrap code，家人用一次性邀请码注册。
- 资料：家庭/成员 scope picker、处理中状态和已整理知识列表；点进条目查看摘要、变化、当前判断和待确认事项。
- 对话：家庭/成员范围 thread、连续消息、异步回答与 citations。
- 家庭：家庭与账号信息、owner 生成家人邀请码、成员档案、退出登录。
- 上传：PhotosPicker 或 fileImporter，支持图片、PDF 和纯文本，multipart 直传 server。

## 客户端状态与安全

- Debug 和 Release 默认 API 都是 `https://nomi.ifuryst.com`，确保模拟器普通启动直接连接生产 private beta；本地 server 和 UI test 必须显式用 `NOMI_API_BASE_URL` 覆盖。
- AuthSession 存 Keychain，使用 `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`；退出会删除 server session 和本地 Keychain item。
- App 每两秒轻量刷新 people/assets/jobs/knowledge/threads/messages，使异步结果自动出现。
- 客户端只传 person scope，不传 household ID；服务端以 session 做最终授权。

## 构建与测试

```sh
xcodebuild -project apps/ios/Nomi.xcodeproj \
  -scheme Nomi \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build

xcodebuild test -project apps/ios/Nomi.xcodeproj \
  -scheme Nomi \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:NomiUITests/NomiUploadFlowUITests
```

认证 UI smoke 默认可独立运行。真实登录 smoke 在本机 Xcode Test scheme 临时注入 `NOMI_E2E_API_BASE_URL`、`NOMI_E2E_EMAIL`、`NOMI_E2E_PASSWORD` 时启用；没有凭据会明确 skip。不要把值提交到 shared scheme。

## 设计约束

- quiet、personal、Apple-like；优先系统控件、Dynamic Type、语义色和清晰留白。
- 首屏只保留完成任务所需的文字；内部路径、技术状态和重复说明不直接展示给家庭用户。
- 不做医疗 dashboard、风险分数或告警色主导的体验。
- AI 结果必须让用户看见“资料说了什么、改变了什么、当前结论和证据引用”。
- 家庭 scope 与成员 scope 必须始终清楚，避免把一个人的资料误归给全家或其他成员。
