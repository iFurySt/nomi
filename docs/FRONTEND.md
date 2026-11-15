# 前端协作说明

Nomi 当前维护 Electron 文稿 / 画布工作台；旧 SwiftUI 家庭客户端已退役。产品定位见 `docs/product-specs/personal-workbench.md`。

## Electron / Web

- `apps/desktop` 与 `apps/web` 组合 `packages/ui` 的同一 React renderer；共享契约在 core，host 能力通过 platform 适配。
- 桌面迁入自 AIFi 当前工作区，复用布局、主题和编辑能力；0.1.0 主入口收敛为 Canvas / 文稿，删除金融页面、Learn 独立页与 Data 设置。
- 桌面运行、ChatGPT 登录、测试、数据目录与迁入边界以 [DESKTOP.md](DESKTOP.md) 为准；设计细节参考 [桌面设计基线](design-docs/desktop-design.md)。
- `pnpm dev:desktop` 启动开发桌面；`pnpm build && pnpm desktop` 验证构建版本；ChatGPT 能力只在桌面开放。
- 可见文字、助手定位和新模块围绕个人工作台展开；当前本地金融工具不应被描述成已经可读所有个人或家庭资料。

## 笔记与 GenUI 协议

未来交互块由平台中立的组件 catalog、状态、表达式 / 动作和能力接口定义。首批 React / TypeScript 是参考实现，SwiftUI / UIKit / Compose 可独立实现相同语义；不把 WebView、CSS 或 React 状态作为原生客户端的必要契约。React 的第一轮已提供 Learn、通用组件映射、SVG 图表、KaTeX、定义编辑 / 导入导出和独立本机学习状态；学习页及公式依赖按路由加载。`pnpm smoke:learning` 验证真实 App 的交互、持久化和错误路径。默认 Canvas 已提供平移 / 缩放、长笔记 Markdown / LaTeX 编辑与聚焦视图、附件和交互块；结构 / 附件在 IndexedDB 保存，`pnpm smoke:canvas` 验证默认主界面与恢复。详见 [画布实现](design-docs/canvas-workspace-runtime.md)。Swift 已有计算 conformance，原生 UI、手写、OpenUI 文本前端和同步待实现。详见 [本轮运行时](design-docs/interactive-learning-runtime.md) 与 [GenUI 与跨端 DSL](design-docs/generative-interactive-content.md)。

## 云同步入口

Nomi 登录为可选能力，登录后自动同步；未登录仍可本地编辑。左下角入口通过默认浏览器登录网站并用 App Link 返回，已登录显示静态账号信息，菜单底部直接 Log out，无账户弹窗或设备界面；设置中没有 Account，Cloud Sync 只配置 Base URL，ChatGPT 连接留在其独立设置。新界面与 host 边界按 [云同步设计](design-docs/cloud-sync.md) 开发。未来手机客户端围绕同一文稿协议重建，不继承旧家庭 UI。
