# Desktop 发布

桌面主入口仅 Canvas / 文稿；设置保留 General、Appearance、ChatGPT。不启动或分发旧金融 Go / MCP 服务，不携带 Codex CLI。独立 `apps/server` 和 iOS beta 不属于桌面发行包。

## 制品与身份

- 版本：根目录和 `apps/desktop/package.json` 保持一致；发布 tag 为 `desktop-vX.Y.Z`。
- 正式 bundle id：`com.ifuryst.nomi`，应用名 Nomi；开发启动器为 `com.ifuryst.nomi.dev`、应用名 `Nomi(Dev)`。开发版独立 userData、默认文稿库与凭据，不注册正式文件关联、不启用 Sparkle，详见 [开发隔离](DESKTOP.md#开发版与正式版隔离)。
- `Nomi-X.Y.Z-mac-arm64.dmg` / `Nomi-X.Y.Z-mac-x64.dmg` 分别适用于 Apple Silicon / Intel，随包有 SHA-256。
- DMG 内含独立 `Nomi.app` 和 Applications 快捷入口。renderer、PDF 资源、原生更新模块全部随包，不引用 checkout；`.nomi` 包注册保持一致。
- Developer ID 签名、hardened runtime、Apple 公证及 stapling 后才能公开发布。App 和 DMG 都验证。原生嵌套 helper 必须先于 framework 主二进制签名；Apple 票据服务未就绪 / 网络错误只做有界重试，不跳过票据验证。`--unsigned` 只用于本机检查，不上传正式 Release。

## 本地构建

```sh
pnpm install --frozen-lockfile
pnpm check && pnpm test
pnpm build
# 凭据来自本机受保护环境 / Keychain，不写入命令历史或仓库。
# NOMI_SIGN_IDENTITY: Developer ID Application identity
# NOMI_NOTARY_PROFILE: notarytool Keychain profile
# 或 ASC_KEY_PATH / ASC_KEY_ID / ASC_ISSUER_ID
node scripts/package-desktop.mjs
```

需要 macOS、Xcode Command Line Tools、Node 24 headers（可通过 `NOMI_NODE_HEADERS` 指定）。输出位于 ignored `.artifacts/desktop-release/<arch>/`。默认使用 Sparkle Keychain account `nomi-desktop`；CI 通过 `SPARKLE_PRIVATE_KEY` 标准输入签名，不把私钥放进参数。公钥和下载配置版本化在 `apps/desktop/packaging/config.json`。

## GitHub Actions

`.github/workflows/desktop-release.yml` 由 `desktop-v*` tag 触发，也可选择已存在的 tag 手动运行。macOS arm64 / Intel runner 各自安装锁定依赖、类型检查、单测、构建、隔离桌面及输入法回归，签名 / 公证 DMG，并从独立发行 App 验证 Sparkle 初始化。两个任务成功后才发布版本文件和更新 feeds。Action 固定到 commit SHA；构建 job 只有 contents read，发布 job 才有 write。

Repository secrets：

| 名称 | 内容 |
| --- | --- |
| `DESKTOP_CERTIFICATE_P12` | 指定 Developer ID identity 的 PKCS#12，base64 |
| `DESKTOP_CERTIFICATE_PASSWORD` | PKCS#12 密码 |
| `DESKTOP_ASC_PRIVATE_KEY` | 公证用 ASC API key |
| `DESKTOP_ASC_KEY_ID` / `DESKTOP_ASC_ISSUER_ID` | API key 标识 |
| `DESKTOP_SPARKLE_PRIVATE_KEY` | Sparkle Ed25519 私钥 |

Repository variable `DESKTOP_SIGN_IDENTITY` 指定身份名称。构建只使用临时 Keychain，按固定 SHA-256 检查 Apple Developer ID 中间证书，仅缺失时从 Apple 下载并校验后导入，结束始终删除 Keychain 和临时凭据。IME 回归在 CI 展示测试窗口、关闭后台节流并启用 CDP 焦点模拟，确认编辑器真正获得焦点后才开始组合输入；不依赖固定延迟或后台 requestAnimationFrame。不得在 pull_request 中导入签名 secret。私钥轮换必须先按 Sparkle 官方轮换协议规划已有安装的信任链。

版本化 DMG 发布后不可覆盖；重跑已公开版本应改版本号。`desktop-updates` 是稳定的更新清单 Release，仅其 `appcast-arm64.xml` / `appcast-x64.xml` 可替换。它不设置为 latest，因此 server 的独立 Release 不影响桌面更新地址。更新 feed 最后上传，始终先确保对应 DMG 已公开。

## Sparkle 2

固定 Sparkle 2.10.1 官方压缩包及 SHA-256，保留 framework symlink 和许可。Objective-C++ N-API 桥运行在 Electron main / AppKit 线程，已发布 0.1.0 使用 `SPUStandardUpdaterController`；0.1.1 改用 `SPUUpdater` + 自定义 `SPUUserDriver`，由侧栏与 Settings 呈现状态，下载 / 验签 / 解包 / 安装仍完全交给 Sparkle。

- Nomi 菜单「检查更新…」打开 General 显示结果；Settings → General → Updates 也能检查。
- 发现新版本后头像上方出现下载按钮；点击开始下载，圆环按已收到字节 / 总字节显示进度。未知大小、解包和安装使用不定进度。
- 下载可以取消；准备完成自动提示「稍后 / 重启并更新」。选择稍后不触发退出；依照 Sparkle 语义，准备完成的更新仍可在用户正常退出后安装。
- 原生阶段与 Settings / 侧栏共享状态；信息型更新、系统不兼容、网络 / 验签失败显示错误。隐藏侧栏的窄屏通过 Settings 操作。
- 自动检查开关使用 Sparkle 自己的持久化偏好，安装由用户确认。
- 应用内公钥验证签名 DMG，清单也签名；不接受 renderer 自定义 feed / URL / 安装路径。
- 点击安装和原生最终重启回调各执行一次全窗口保存屏障；保存失败保持暂停，用户可重试，不循环强行安装。正常关闭也有原有保存屏障；Sparkle 等待退出超过 8 秒时恢复重试入口。
- 开发启动器不检查更新。`--smoke` 隔离文稿、账号并跳过 updater；发行包 `--update-smoke` 同样隔离数据，但验证原生 updater 初始化，不下载 / 安装更新。
- 0.1.0 是首版；“检测到无更新”验证不等于真实跨版本替换，后续版本需补一次签名升级、退出保存和重新打开原文稿的完整验收。

参考：[Sparkle programmatic setup](https://sparkle-project.org/documentation/programmatic-setup/)、[发布与签名](https://sparkle-project.org/documentation/publishing/)、[Electron 自动更新边界](https://www.electronjs.org/docs/latest/tutorial/updates)。

## 0.1.0 发布验收

[公开 Release](https://github.com/iFurySt/nomi/releases/tag/desktop-v0.1.0) 已由 [双架构流水线](https://github.com/iFurySt/nomi/actions/runs/41308518487) 发布，源码 tag 固定为 `desktop-v0.1.0`。Apple Silicon / Intel 均通过类型、单测、IME、签名、公证、stapling 和独立 App / Sparkle 初始化验证。

从公开地址重新下载 arm64 DMG，SHA-256、DMG / App 公证票据、Gatekeeper 和 Ed25519 签名验证通过；两个架构的 appcast 签名均已验证。已安装到 Applications 并实际启动，原生 Sparkle 显示“0.1.0 已是最新版本”，[截图](generated/verification/nomi-sparkle-up-to-date-2026-11-01.png)。首次启动需在 macOS 系统提示中允许访问 Documents；未响应授权时文稿读取会等待。

## 自定义更新 UI 回归

```sh
node scripts/check-update-host.mjs
node scripts/check-update-ui.mjs
# macOS；先由 package-desktop 拉取并校验固定版本 Sparkle
node scripts/check-update-driver.mjs
```

Host 回归检查 IPC 主 frame / URL 限制、非法操作、全窗口保存失败与成功、并发安装去重、最终退出保存和手动重试。UI fixture 只使用隔离测试状态，不下载、不安装、不访问真实文稿；检查下载 / 进度 / 取消 / 稍后 / 重启 / 错误及浅深色、窄屏截图。原生回归执行固定版本框架的 driver 回调契约（包括一次性 reply、信息型更新、无更新原因、退出重试）。这三项不能替代后续真实跨版本签名安装验收。

## 0.1.1 发布验收

[公开 Release](https://github.com/iFurySt/nomi/releases/tag/desktop-v0.1.1) 已由 [双架构流水线](https://github.com/iFurySt/nomi/actions/runs/41315497158) 发布，tag 固定于 `21f6da7`。两个架构通过类型、285 单测、桌面 / IME / 图标 / 更新 UI、原生 driver、签名、公证与独立 App 更新初始化检查。Intel 首次尝试暴露 IME 测试固定延时问题，已改为等待实际持久化和重载恢复，CI 无 EGL 时使用软件渲染；重新构建通过。

公开 arm64 DMG 的 SHA-256、Sparkle Ed25519 签名与 stapled 公证票据在下载后验证通过；两个 appcast 的签名、0.1.1 版本与下载地址均通过。真实已安装 0.1.0 的 Sparkle 窗口确认发现 0.1.1，[截图](generated/verification/nomi-010-detects-011-2026-11-01.png)。保留窗口的 Install Update 入口由用户测试下载 / 重启；该结果证明更新发现，不等同已完成跨版本安装。

本版本修复新增文稿字段导致整库加载失败：已知语义继续校验，附加 JSON 元数据保留，未知版本 / 内容类型仍禁止破坏性写回。0.1.0 需要升级才能读取新增图标；本机新构建已确认文稿恢复，未修改用户正文。

## 0.1.2 发布验收

[公开 Release](https://github.com/iFurySt/nomi/releases/tag/desktop-v0.1.2) 已由 [双架构流水线](https://github.com/iFurySt/nomi/actions/runs/41477619243) 发布，tag 固定于 `c9c8283`。两个架构通过类型、291 单测、桌面 / IME / 导航 / 子文稿集合 / 生产 bundle 斜杠菜单 / 图标 / 更新 UI、原生 driver、签名、公证与独立 App 更新初始化检查。修复旧导航顺序断言，并为无 EGL 的 CI smoke 使用软件渲染；ARM runner 曾因容量不足未获分配，重试失败任务后通过，复用了 Intel 成功制品。

从公开 Release 重新下载的 arm64 / x64 DMG 均通过 SHA-256、Sparkle Ed25519 签名、长度与 stapled 公证票据验证；两个 appcast 的签名、0.1.2 版本和下载地址均通过。挂载 arm64 DMG 后，App 的严格深度签名、公证票据、Gatekeeper 与内嵌版本检查通过。制品校验位于 ignored `.artifacts/desktop-012-verification/`。

本机开发构建的软件渲染桌面 / 更新 UI smoke 已通过。本次发布结束时 Mac 锁屏，真实窗口最终重启验收待解锁；没有替用户执行已安装版本的下载 / 重启升级，不将公开制品及更新清单验证表述为跨版本安装成功。

本版本新增文稿引用块，使用后需要 0.1.2 或更新版本读取；旧版对未知内容类型的保护仍有效，避免降级写回。普通已有文稿无需手动迁移。

## 0.1.3 发布验收

[公开 Release](https://github.com/iFurySt/nomi/releases/tag/desktop-v0.1.3) 已由 [双架构流水线](https://github.com/iFurySt/nomi/actions/runs/41664512193) 发布，tag 固定于 `70395af`。两个架构通过类型、305 单测、既有桌面 / 文稿 / 更新回归，以及新增内嵌画布、AI 生成、ChatGPT 登录专项检查；签名、公证、stapling、原生 driver 与独立 App 更新初始化通过。首次预检发现新增画布后斜杠菜单数量断言过期，修复并验证生产 bundle 后重启尚未发布的版本流程。

从公开地址下载的 arm64 / x64 DMG 均通过长度、SHA-256、Sparkle Ed25519 签名及 stapled 公证票据验证；两个 appcast 的签名、0.1.3 版本与下载地址通过。挂载 arm64 App 后，其严格深度签名、Gatekeeper、公证票据与内嵌版本检查通过。ignored `.artifacts/desktop-013-verification/` 保存本地校验制品。

本机 0.1.3 开发 App 已重新构建、退出重启并在实际窗口确认左侧形状菜单、文稿内画布的 Close / 名称及 Esc 返回。包含内嵌画布的文稿需 0.1.3 或更新版本读取；旧版未知块的保护仍有效。此次验证没有替用户执行已安装版本的自动升级安装。
