## [2026-10-18 22:34] | Task: 明确个人工作台定位并迁入 Electron 基础

### Execution Context

- Agent ID: `/root`
- Base Model: GPT-6（系统标识）
- Runtime: Codex desktop，本地 macOS workspace

### User Query

> 将 Nomi 从健康产品扩展为学习、笔记、信息 hub、知识、健康和财富管理的个人一站式工作台，支持扩展到家庭成员；复制 AIFi 现有 Electron 应用及 ChatGPT 登录集成，作为后续裁剪和开发基础。

### Changes Overview

- 新增当前个人工作台规格，更新 README、AGENTS、产品 / 架构 / 设计 / 前端 / 安全 / 稳定性 / 质量 / 发布文档及 server 公共介绍、workspace Agent 描述和资料分析提示词。旧 body-log 规格标为历史，家庭 beta 保留为已有领域能力。
- 迁入 AIFi 当日工作区的 Electron、Web、共享 UI / core / platform / Node host、Go CLI、lockfile、构建及 smoke 脚本与 Codex notices，包含源仓库未提交迭代。
- 应用名、包、IPC、localStorage、MCP、Go module、OAuth 展示身份、数据目录改为 Nomi，保留成熟布局与现有金融页面；Chat 通用提示词及起始任务覆盖个人工作台。
- 没有迁入账号、个人资料、数据库、环境配置或 Git 元数据。源码保留来源许可证，使用 `LICENSE.aifi` / `NOTICE` 区分 AGPL 桌面来源与既有 MIT 代码。
- 新增本地数据目录隔离回归；修正迁入启动 smoke 的旧导航断言；补齐 Vite 对原 Nomi 签名 / 本地数据目录及签名文件的访问拒绝，新增可运行的 HTTP 边界 smoke。

### Design Intent

先建立可独立运行的桌面基线，保留已经验证过的交互和 AI 基础，后续再按领域裁剪。文档区分产品方向与实际交付：桌面本地数据和 iOS / server 当前独立，现有家庭全共享授权不能自动应用于未来个人私有资料。

### Verification

- TypeScript 类型检查、43 文件 / 208 单测通过。
- 本地 Go 格式、vet、race 测试和 CGO-off 构建通过；现有 server Go 测试通过。
- Web / Electron 生产构建、完整 Electron smoke 与连续交互、ChatGPT UI、真实 Codex app-server + 合成推理 transport、本地 MCP 子进程及恢复、导航 / 主题检查通过。
- Vite 实测 8 类合成私有路径返回 403，普通文件返回 200；没有读取真实 secret。
- `make ci`、`git diff --check`、包许可证 / namespace 与文件清单检查通过。macOS bundle 名为 Nomi，id 为 `com.ifuryst.nomi.local`；已查看合成聊天截图。
- npm registry 超时，冻结离线安装后仅在 ignored node_modules 复用本机已安装的精确版本 Codex 平台包补齐验证环境；Electron 使用本机下载缓存。首次 Electron 并发解压冲突后顺序重试通过。

### Limitations

真实 ChatGPT 授权需在 Nomi 内重新完成，未沿用 AIFi 会话；未调用真实模型推理或执行生产发布。金融页面与源图形暂留，领域模块、个人 / 家庭权限和跨端同步待后续。构建仍有大于 500 kB 的 renderer chunk 提示。

### Files Modified

- `docs/product-specs/personal-workbench.md`、`docs/DESKTOP.md`、`docs/ARCHITECTURE.md`
- `apps/desktop/`、`apps/web/`、`apps/cli/`、`packages/`
- `scripts/*desktop*`、`scripts/bundle-codex.mjs`、`scripts/check-dev-file-boundary.mjs` 与迁入的合成 fixtures
- 根 workspace 配置、`LICENSE.aifi`、`NOTICE` 与相关产品 / 开发文档
