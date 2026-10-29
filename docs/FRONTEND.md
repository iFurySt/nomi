# 前端协作说明

Nomi 当前同时维护 Electron 桌面工作台与原生 SwiftUI iPhone beta。产品定位见 `docs/product-specs/personal-workbench.md`。

## Electron / Web

- `apps/desktop` 与 `apps/web` 组合 `packages/ui` 的同一 React renderer；共享契约在 core，host 能力通过 platform 适配。
- 桌面迁入自 AIFi 当前工作区，保留现有布局、导航、主题、设置与金融页面作为继续开发的基础，避免迁入时重做成熟交互。
- 桌面运行、ChatGPT 登录、测试、数据目录与迁入边界以 [DESKTOP.md](DESKTOP.md) 为准；设计细节参考 [桌面设计基线](design-docs/desktop-design.md)。
- `pnpm dev:desktop` 启动开发桌面；`pnpm build && pnpm desktop` 验证构建版本；ChatGPT 能力只在桌面开放。
- 可见文字、助手定位和新模块围绕个人工作台展开；当前本地金融工具不应被描述成已经可读所有个人或家庭资料。

## 笔记与 GenUI 协议

未来交互块由平台中立的组件 catalog、状态、表达式 / 动作和能力接口定义。首批 React / TypeScript 是参考实现，SwiftUI / UIKit / Compose 可独立实现相同语义；不把 WebView、CSS 或 React 状态作为原生客户端的必要契约。React 的第一轮已提供 Learn、通用组件映射、SVG 图表、KaTeX、定义编辑 / 导入导出和独立本机学习状态；学习页及公式依赖按路由加载。`pnpm smoke:learning` 验证真实 App 的交互、持久化和错误路径。默认 Canvas 已提供平移 / 缩放、长笔记 Markdown / LaTeX 编辑与聚焦视图、附件和交互块；结构 / 附件在 IndexedDB 保存，`pnpm smoke:canvas` 验证默认主界面与恢复。详见 [画布实现](design-docs/canvas-workspace-runtime.md)。Swift 已有计算 conformance，原生 UI、手写、OpenUI 文本前端和同步待实现。详见 [本轮运行时](design-docs/interactive-learning-runtime.md) 与 [GenUI 与跨端 DSL](design-docs/generative-interactive-content.md)。

## iOS beta

`apps/ios/` 保留现有家庭资料与对话能力。旧 Swift macOS body-log 客户端不再维护；新的桌面入口为 Electron。

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
