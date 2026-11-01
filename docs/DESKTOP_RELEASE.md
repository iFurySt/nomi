# Desktop 0.1.0 发布

桌面主入口仅 Canvas / 文稿；设置保留 General、Appearance、ChatGPT。不启动或分发旧金融 Go / MCP 服务，不携带 Codex CLI。独立 `apps/server` 和 iOS beta 不属于桌面发行包。

## 制品与身份

- 版本：根目录和 `apps/desktop/package.json` 保持一致；发布 tag 为 `desktop-vX.Y.Z`。
- 正式 bundle id：`com.ifuryst.nomi`，开发启动器为 `com.ifuryst.nomi.local`。两者应用名为 Nomi，沿用同一文稿配置；不要同时编辑同一库。
- `Nomi-X.Y.Z-mac-arm64.dmg` / `Nomi-X.Y.Z-mac-x64.dmg` 分别适用于 Apple Silicon / Intel，随包有 SHA-256。
- DMG 内含独立 `Nomi.app` 和 Applications 快捷入口。renderer、PDF 资源、原生更新模块全部随包，不引用 checkout；`.nomi` 包注册保持一致。
- Developer ID 签名、hardened runtime、Apple 公证及 stapling 后才能公开发布。App 和 DMG 都验证。`--unsigned` 只用于本机检查，不上传正式 Release。

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

Repository variable `DESKTOP_SIGN_IDENTITY` 指定身份名称。构建只使用临时 Keychain，结束始终删除 Keychain 和临时凭据。不得在 pull_request 中导入签名 secret。私钥轮换必须先按 Sparkle 官方轮换协议规划已有安装的信任链。

版本化 DMG 发布后不可覆盖；重跑已公开版本应改版本号。`desktop-updates` 是稳定的更新清单 Release，仅其 `appcast-arm64.xml` / `appcast-x64.xml` 可替换。它不设置为 latest，因此 server 的独立 Release 不影响桌面更新地址。更新 feed 最后上传，始终先确保对应 DMG 已公开。

## Sparkle 2

固定 Sparkle 2.10.1 官方压缩包及 SHA-256，保留 framework symlink 和许可。Objective-C++ N-API 桥运行在 Electron main / AppKit 线程，采用官方 `SPUStandardUpdaterController` 原生 UI；不是 Electron 的 Squirrel updater。

- Nomi 菜单「检查更新…」和 Settings → General → Updates 都能检查。
- 自动检查开关使用 Sparkle 自己的持久化偏好，安装由用户确认。
- 应用内公钥验证签名 DMG，清单也签名；不接受 renderer 自定义 feed / URL / 安装路径。
- 原生安装回调先暂停，等待所有文稿窗口完成保存；保存失败保持暂停并提供重试。正常关闭也有原有保存屏障。
- 开发启动器不检查更新。`--smoke` 隔离文稿、账号并跳过 updater；发行包 `--update-smoke` 同样隔离数据，但验证原生 updater 初始化，不下载 / 安装更新。
- 0.1.0 是首版；“检测到无更新”验证不等于真实跨版本替换，后续版本需补一次签名升级、退出保存和重新打开原文稿的完整验收。

参考：[Sparkle programmatic setup](https://sparkle-project.org/documentation/programmatic-setup/)、[发布与签名](https://sparkle-project.org/documentation/publishing/)、[Electron 自动更新边界](https://www.electronjs.org/docs/latest/tutorial/updates)。
