# macOS Records UIUX And Image Import

## 用户诉求

macOS 版本已有，但界面太丑、无用元素太多；按给定视觉方向调整 UIUX，并在本地拉起 server / SeedX，用 Debug app 连本地验证整体功能。

## 主要改动

- 将 macOS Records 从只有一个入口的 `NavigationSplitView` sidebar 收敛为单窗格记录流，减少左侧空 chrome 和重复标题。
- 记录行从重卡片改为轻分隔列表，正文宽度收窄，窗口最小尺寸降低，让内容成为首屏重点。
- Add sheet 增加 `Choose Image` 主入口，选择图片后调用同一个 server `POST /ai/extract-image`，由本地 SeedX/Codex 分析并保存记录。
- 保留手动文字记录 fallback，但弱化为次级保存按钮。
- 同步更新 macOS 架构、前端说明和质量评分文档。

## 设计动机

- 当前 macOS 只有 Records 一个真实页面，sidebar 只会增加无效导航和视觉噪音；等 Log / Ask / Trends 等桌面端入口有真实内容后再恢复侧栏更合适。
- 用户要求联调 server + SeedX，macOS Add 必须覆盖图片分析主链路，否则只能验证文字记录，不能代表 Nomi 的真实 capture 流程。
- 桌面端不复刻 iOS 底栏，继续使用 macOS 系统窗口、图标按钮、segmented picker 和原生 file importer。

## 验证

- `cd apps/macos/NomiMac && ./scripts/build-app.sh`

后续本轮还需要启动本地 server、保持 `seedx daemon connect` 在线，并用 Debug app 选择图片做端到端验证。
