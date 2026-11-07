# nomi

Nomi / 知己是个人一站式工作台，覆盖学习、笔记、信息 hub、知识、健康和财富管理，并可扩展到家庭成员。这个仓库采用 Agent-first 协作方式。

`AGENTS.md` 故意保持简短，只负责做导航，不负责塞满所有规则。仓库内的 `docs/` 才是本地知识的正式来源。

如果一次代码或流程变更会让某份文档过期，就在同一轮任务里顺手把它改掉。

## 每轮开始先读

- `docs/REPO_COLLAB_GUIDE.md`：仓库级协作、提交、文档同步与测试约定。
- `docs/ARCHITECTURE.md`：仓库整体结构和预期边界。
- `docs/design-docs/core-beliefs.md`：Agent-first 的工作原则和这个模板的设计出发点。

## 代码改完前要读

- `docs/HISTORY_GUIDE.md`：什么时候记 history、怎么命名、怎么脱敏。
- `docs/QUALITY_SCORE.md`：当前质量分层和主要短板。

## 按任务需要选读

- `docs/PLANS_GUIDE.md`：什么时候要写 execution plan，怎么维护。
- `docs/product-specs/personal-workbench.md`：当前产品定位、领域边界和阶段范围。
- `docs/design-docs/generative-interactive-content.md`：交互块（统一产品名称）、GenUI、交互学习、平台中立 DSL 与原生 renderer 的当前架构修订。
- `docs/design-docs/notes-infinite-canvas.md`：当前笔记 / 无限画布方向、DSL、跨端和手写架构提案。
- `docs/design-docs/nomi-package-format.md`：`.nomi` 目录文件包的当前格式、AI 编辑规则、迁移、共享引用和打开边界；长期设计见相邻 `nomi-document-package.md`。
- `docs/DESKTOP_RELEASE.md`：桌面 DMG、Sparkle、签名公证与 GitHub Actions 发布。
- `docs/DESKTOP.md`：Electron 工作台、本地数据、ChatGPT 登录与迁入边界。
- `docs/PRODUCT_SENSE.md`：产品价值、取舍方式和优先级判断。
- `docs/RELIABILITY.md`：运行稳定性、观测性和上线前的基本要求。
- `docs/SECURITY.md`：认证、数据处理、外部集成等安全默认约束。
- `docs/SUPPLY_CHAIN_SECURITY.md`：依赖、SBOM、制品 provenance 和仓库级供应链安全约束。
- `docs/CICD.md`：仓库的 CI/CD 骨架以及后续如何接入真实项目。
- `docs/DEPLOYMENT.md`：server 发版、GHCR 镜像和 amoylab `/opt/nomi` 部署流程。
- `docs/IOS_TESTFLIGHT_RELEASE.md`：iOS TestFlight 手动发布、Apple signing、App Store Connect 和本机 secret 存放流程。
- `docs/FRONTEND.md`：如果仓库包含前端界面，这里记录对应规范。
- `docs/UIUX_REFERENCE.md`：如果改动用户可见界面、动效、底部导航、timeline、上传 sheet 或设计 token，先读这里的 UIUX 标准和参考入口。
- `CONTRIBUTING.md`：提 PR 前后的默认检查项和协作要求。
- `docs/releases/README.md`：如何维护面向用户的发布记录。
- `docs/references/README.md`：沉淀到仓库里的外部参考资料。

## 工作规则

- 优先选择小而清晰、对仓库和 Agent 都友好的抽象。
- prompt、规则、架构约束尽量都版本化落在仓库里。
- 复杂任务不要只靠聊天上下文，应该落 execution plan。
- 完成的代码变更要记到 `docs/histories/`。
- 用户提到 server 发版时，先按 `docs/DEPLOYMENT.md` 递增 `server-v*` tag，推送后观察 GitHub Actions 和 amoylab health。
- 用户提到 iOS / TestFlight / 上架时，先按 `docs/IOS_TESTFLIGHT_RELEASE.md` 检查 bundle id、team、build number、生产 API 和 App Store Connect processing 状态。
