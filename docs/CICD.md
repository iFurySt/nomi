# CI/CD 说明

这个仓库当前只保留正在使用的 CI/CD 入口：仓库基础检查和 Nomi server 发版。

## 默认包含的内容

- `ci.yml`：仓库级检查，覆盖 docs、repo hygiene、脚本语法和 GitHub Actions 固定 SHA 校验。
- `server-release.yml`：推送 `server-v*` tag 后构建 `apps/server` Docker 镜像，推送到 GHCR，并通过受限 SSH key 部署到 `amoylab:/opt/nomi`。
- iOS TestFlight 目前不走 GitHub Actions，默认用本机 Xcode paid account、automatic signing 和 App Store Connect 手动上传；流程见 `docs/IOS_TESTFLIGHT_RELEASE.md`。

## 设计原则

流水线只描述真实可执行的仓库行为，避免保留模板占位 release 或暂未接入的安全扫描。

所有 GitHub Actions 都已经 pin 到 commit SHA。后续升级 action 时，也要继续保持这个约束。

## 推荐接入顺序

1. 保留 `ci.yml`，作为唯一默认常驻的仓库基础门禁。
2. 在 `scripts/ci.sh` 里继续叠加项目自己的验证命令。
3. Server 真实部署已接入 `server-release.yml`，后续 server 发版通过递增 `server-v*` tag 触发。
4. iOS TestFlight 先保持本机手动发布；等需要自动化时，再把 App Store Connect API key、provisioning 和证书迁入专用 secret 管理，而不是复用本机 `.harness/secret`。
5. 后续如果重新接入仓库级 release、SBOM、provenance 或漏洞扫描，先绑定真实构建产物和明确的发布目标。

## Server 发版

Server 镜像发布到 `ghcr.io/ifuryst/nomi-server`，tag 发布会同时写入 `server-v*`、`sha-*` 和 `latest` 标签。部署 job 使用仓库 secrets 中的 amoylab SSH 配置，远端 key 被 forced command 限定到固定部署脚本。

后续用户提到 server 发版时，默认执行：

```sh
git tag server-vX.Y.Z
git push origin server-vX.Y.Z
```

然后观察 GitHub Actions 的 `Server 发布` workflow 和 amoylab `/opt/nomi` 服务健康状态。详细步骤见 `docs/DEPLOYMENT.md`。

## iOS TestFlight

iOS 发布的固定信息：

- App Store Connect App ID：`6767420142`
- Bundle ID：`com.ifuryst.nomi`
- Apple Developer team：`J9P29FA5BX`
- Scheme：`Nomi`

后续用户提到发 TestFlight 时，默认执行：

1. 确认 `https://nomi.ifuryst.com/health` 正常。
2. 递增 `CURRENT_PROJECT_VERSION`。
3. 跑 iOS Debug simulator build。
4. 用 Release archive 上传 App Store Connect。
5. 在 App Store Connect TestFlight 页面确认 build processing 完成。

详细命令和常见错误见 `docs/IOS_TESTFLIGHT_RELEASE.md`。真实 Apple 密钥、`.p8`、`.p12` 和 provisioning profiles 不写入 git；如必须本机留存，放在 `.harness/secret/apple/`。
