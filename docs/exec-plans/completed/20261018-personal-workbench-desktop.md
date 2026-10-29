# Nomi 个人工作台定位与桌面应用迁入

## 目标与范围

Nomi 定位为个人一站式工作台，覆盖学习、笔记、信息 hub、知识、健康与财富管理，并可扩展到家庭成员。本轮同步当前产品、架构和界面描述，从 AIFi 当前工作区迁入可独立构建的 Electron 应用及其 React、Node、Go 依赖，保留既有设计和 ChatGPT 登录 / Codex 集成供后续裁剪。

## 约束与决定

- 复制源码、依赖锁和必要第三方声明；不复制登录态、个人资料、数据库、node_modules、构建缓存或源仓库 Git 元数据。
- AIFi 当前存在未提交迭代，本次迁入包含这些源码；不修改源仓库。
- 桌面应用采用 Nomi 应用名、包命名空间、IPC、OAuth 展示身份和独立数据目录；用户在 Nomi 中重新登录 ChatGPT。
- 保留现有 iOS / server 的家庭资料能力。桌面本地存储与 server 暂时独立，不暗示已完成跨端同步或新增领域模块。
- 保留来源许可证与 notices，不把 AGPL 来源代码标注成 MIT。
- 本轮不发布 server / TestFlight，不做全领域模块开发，不提前大范围删除 AIFi 功能。

## 步骤

- [x] 阅读仓库规则，梳理 AIFi 依赖、当前工作区与数据边界。
- [x] 迁入完整桌面源码闭包与运行脚本，调整 Nomi 身份与通用助手描述。
- [x] 同步产品、架构、开发、设计、安全与发布描述，明确已实现和后续方向。
- [x] 安装锁定依赖，执行类型检查、单测、Go 检查、生产构建与 Electron smoke。
- [x] 记录 history、验证证据和剩余限制，归档计划。

## 风险与验证

主要风险为隐式源码依赖缺失、应用身份 / 数据目录碰撞、ChatGPT 凭据误复制和旧金融提示词限制新定位。以 clean install / build、现有回归测试、隔离 Electron smoke 和迁入文件清单检查验证。真实 ChatGPT OAuth 需用户交互授权，本轮不复用 AIFi 会话、不触发收费推理；登录链路用迁入的合成回归验证。

## 回退

迁入仅新增独立桌面目录及根 workspace 配置，现有 server / iOS 协议与生产数据不迁移。必要时可撤销本轮变更恢复原客户端结构。

## 完成证据

- pnpm 冻结 lockfile 安装完成。npm registry 超时导致缺失可选 Codex ARM64 平台包，本机以已安装的同版本 npm 平台包补齐 ignored 依赖；Electron 从本机包管理器缓存解压。未把依赖缓存提交为源码。
- `pnpm check`、`pnpm test`（43 文件 / 208 测试）、`pnpm check:desktop-go`（gofmt / vet / race / CGO-off build）、server `go test ./...` 通过。
- `pnpm build`、`pnpm smoke:desktop`（含交互连续性）、`pnpm smoke:chatgpt`、`pnpm smoke:codex`、`pnpm smoke:mcp`、`pnpm smoke:navigation` 通过。
- 为原有 `.apple` / `.harness` / `.nomi` 资料补 Vite deny，并以 `pnpm smoke:dev-security` 实测 8 类合成私有路径 403、普通控制文件 200。
- 修正源应用启动 smoke 未跟随 Arena 更新的六入口数量断言，改为验证实际导航目标。
- `make ci` / `git diff --check` 通过；macOS bundle 展示名为 Nomi，id 为 `com.ifuryst.nomi.local`；合成聊天桌面截图已查看，保留原设计布局。

## 留待后续

Nomi 真实 ChatGPT 浏览器授权与推理需用户在独立安装内完成。金融功能裁剪、独立桌面图标、领域专用模块、个人 / 家庭权限、跨端同步和桌面发布不属于本轮。Vite 目前提示 renderer 主 chunk 大于 500 kB，后续按模块拆分。
