# iOS TestFlight 发布

本文记录 Nomi iOS app 后续发 TestFlight 的默认流程。当前 iOS 发布仍是本机手动流程；CI 只负责仓库和 server，暂不在 GitHub Actions 里保存 Apple 签名密钥。

## 固定信息

- App Store Connect App ID：`6767420142`
- App Store Connect name：`Nomi: Know Me`
- Bundle ID：`com.ifuryst.nomi`
- SKU：`nomi-ios`
- Apple Developer team：`J9P29FA5BX`
- Xcode account：Yifan PANG
- Scheme：`Nomi`
- Project：`apps/ios/Nomi.xcodeproj`
- Production API：`https://nomi.ifuryst.com`

The app binary display name can remain `Nomi` through `PRODUCT_NAME`; App Store Connect 的展示名可以后续随新版本审核再调整。`Bundle ID` 和 `SKU` 创建后不要再改。

## 本机前置条件

1. Xcode 已登录 Yifan PANG 的 paid Apple Developer account，或仓库本机 `.apple/` 中已有 Admin 角色的 App Store Connect API key。
2. Xcode 能通过 automatic signing 使用 team `J9P29FA5BX`。
3. Keychain / Xcode 或 Admin API key 可使用 Cloud Managed Apple Distribution；不需要把 iOS distribution `.p12` 提交到仓库。
4. `nomi.ifuryst.com` 已指向 amoylab，并通过 HTTPS 暴露 server API。

快速检查：

```sh
security find-identity -v -p codesigning
xcodebuild -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Release -showBuildSettings -destination 'generic/platform=iOS' | rg 'DEVELOPMENT_TEAM|PRODUCT_BUNDLE_IDENTIFIER|MARKETING_VERSION|CURRENT_PROJECT_VERSION'
curl --noproxy '*' -fsS https://nomi.ifuryst.com/health
```

预期 build settings 至少包含：

```text
DEVELOPMENT_TEAM = J9P29FA5BX
PRODUCT_BUNDLE_IDENTIFIER = com.ifuryst.nomi
```

## 每次发布步骤

1. 确认 server 线上健康：

```sh
curl --noproxy '*' -fsS https://nomi.ifuryst.com/health
test "$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' https://nomi.ifuryst.com/v1/people)" = 401
```

1. 更新 iOS build number。

每次上传 App Store Connect 的 `CURRENT_PROJECT_VERSION` 必须递增；`MARKETING_VERSION` 只在对外版本号变化时递增。当前项目使用：

```text
MARKETING_VERSION = 0.1
CURRENT_PROJECT_VERSION = 5
```

1. 先跑本地验证。

```sh
xcodebuild -project apps/ios/Nomi.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

1. Archive。

```sh
rm -rf build/Nomi-TestFlight.xcarchive build/Nomi-TestFlight-export build/Nomi-TestFlight-upload

xcodebuild \
  -project apps/ios/Nomi.xcodeproj \
  -scheme Nomi \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/Nomi-TestFlight.xcarchive \
  -allowProvisioningUpdates \
  clean archive
```

1. 准备 export options。

```sh
rm -f /tmp/NomiUploadOptions.plist
/usr/libexec/PlistBuddy \
  -c 'Add :method string app-store-connect' \
  -c 'Add :teamID string J9P29FA5BX' \
  -c 'Add :signingStyle string automatic' \
  -c 'Add :destination string upload' \
  -c 'Add :manageAppVersionAndBuildNumber bool false' \
  /tmp/NomiUploadOptions.plist
```

1. 上传到 App Store Connect。

默认使用仓库本机 `.apple/app-store-connect.env` 中的 Admin API key，以免依赖容易过期的 Xcode Apple ID session：

```sh
set -a
. ./.apple/app-store-connect.env
set +a

xcodebuild \
  -exportArchive \
  -archivePath build/Nomi-TestFlight.xcarchive \
  -exportPath build/Nomi-TestFlight-upload \
  -exportOptionsPlist /tmp/NomiUploadOptions.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$(pwd)/${ASC_KEY_PATH}" \
  -authenticationKeyID "${ASC_KEY_ID}" \
  -authenticationKeyIssuerID "${ASC_ISSUER_ID}"
```

成功时输出里会出现：

```text
Uploaded package is processing.
Upload succeeded.
```

1. 打开 App Store Connect TestFlight 页面，等待 processing 完成。

```text
https://appstoreconnect.apple.com/apps/6767420142/testflight
```

如果页面要求 export compliance，当前 app 只使用系统 HTTPS / 标准加密；`Info.plist` 已声明 `ITSAppUsesNonExemptEncryption = false`。

## 本地 secret 存放

真实 Apple 密钥和证书不要提交到仓库。若后续必须保留本机发布材料，只放在已被 `.gitignore` 忽略的目录：

```text
.apple/
```

建议只保存这类本机材料：

- `AuthKey_*.p8`，仅当后续改成 API key 上传时需要。
- `*.p12`，仅当不用 Xcode cloud managed signing、改为手动签名时需要。
- `*.mobileprovision`，仅当手动 provisioning 时需要。
- `app-store-connect.env`，保存 key name、role、key ID、issuer ID 和相对私钥路径，不要复制真实值到 docs 或 history。

`0.1 (5)` 已使用 `.apple/` 中的 Admin API key 和 Cloud Managed Apple Distribution 上传成功，并进入现有内部测试组；不需要额外保存 iOS distribution `.p12`。

## 家庭成员外部测试

没有 App Store Connect 权限的家庭成员必须使用 External Testing。第一个外部 build 需要 Apple Beta App Review，按以下顺序推进：

1. 确认公开页面可访问：

```sh
curl --noproxy '*' -fsS https://nomi.ifuryst.com/privacy >/dev/null
curl --noproxy '*' -fsS https://nomi.ifuryst.com/support >/dev/null
```

2. 用生产容器内的运维命令创建隔离审核家庭。不要把审核账号加入真实家庭，也不要通过命令参数传密码；命令会自行生成随机密码并写入权限 `0600` 的文件：

```sh
ssh amoylab 'docker exec nomi-server /usr/local/bin/nomi-server provision-review-household --credentials-file /var/lib/nomi/admin/testflight-review.json'
scp amoylab:/opt/nomi/data/admin/testflight-review.json .apple/testflight-review.json
chmod 600 .apple/testflight-review.json
```

3. 在 TestFlight → Test Information 填写 beta 描述、feedback email、privacy URL、审核联系人和隔离审核账号；review notes 说明这是家庭健康资料 private beta、演示家庭为空、AI 结果仅供资料整理且不是医疗建议。
4. 建立 External Testing group，把当前 build 加入组并提交 Beta App Review。输入联系人、登录凭据和最终提交都属于对 Apple 的外部传输，执行前必须由用户确认。
5. 审核通过后，把家庭成员邮箱加入 external group；家庭 owner 在 App 内生成一次性邀请码，家人安装后自行注册加入真实家庭。

审核凭据不得提交 git。生产与本机副本都应只对 owner 可读；如果后续轮换，应通过受审计的运维流程同步更新 App Store Connect。

建议使用以下英文审核文案，避免把 private beta 描述成诊疗产品：

```text
Beta App Description
Nomi helps invited family members organize health records, keep a shared long-term knowledge base, and ask source-linked questions about the information they provide.

Review Notes
Nomi is an invitation-only family health record organizer. Use the supplied review account, which belongs to an isolated demo household and contains no real family health data. The Records tab accepts photos, PDFs, and text files; processing is asynchronous and may take up to one minute. The Chat tab answers from the demo household workspace and shows source paths when supporting material exists. Nomi organizes user-provided information and does not diagnose, prescribe, adjust medication, or provide emergency services.
```

当前 `0.1 (5)` 已进入 `Nomi Family Beta` external group，Beta Review 状态为 `APPROVED`。审核联系人和 demo credential 已提交 Apple，但敏感值只保留在 App Store Connect 与 git ignored 的本机/生产凭据文件中。下一步可选择：

- 直接添加家庭成员邮箱为 external tester；或
- 创建人数受限的 Public Link，再通过 Nomi 的一次性家庭邀请码控制真正的账号加入。

Public Link 会让持有链接的人都能安装 build，属于新的分发权限变更；创建前需要用户单独确认，并应启用较小的人数上限。

## 常见阻塞

- `missingApp(bundleId: "com.ifuryst.nomi")`：App Store Connect 里还没有创建对应 App 记录。
- `dev.nomi.native cannot be registered`：旧 bundle id 不属于当前 paid team；发布必须使用 `com.ifuryst.nomi`。
- `No profiles for ... were found`：Xcode 没有登录 paid team，或 automatic signing 没有权限创建 profile。
- `Cloud signing permission error`：Developer 角色 API key 可以认证，但没有 Cloud Managed Apple Distribution 权限；使用 Account Holder 或 Admin key。
- `Error Downloading App Information`：通常是 App Store Connect App 记录缺失、账号没有 App Store Connect 权限，或 Safari/Xcode 账号会话失效。
