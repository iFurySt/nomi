# 供应链安全

这份文档记录仓库当前采用的供应链安全做法，以及后续重新接入自动化扫描时的要求。

## 默认控制项

- 所有 GitHub Actions 都固定到不可变的 commit SHA，而不是漂移的版本标签。
- 当前自动化发布覆盖桌面签名 / 公证 DMG（见 `DESKTOP_RELEASE.md`）和 `apps/server` Docker 镜像构建、GHCR 推送和 amoylab 部署。
- 通用 release、SBOM、provenance、Dependency Review 和 OSV 扫描暂不保留占位 workflow；重新接入时必须绑定真实构建产物、依赖清单和明确失败策略。

## 桌面依赖与来源

- Node / pnpm 版本和 pnpm lockfile 纳入版本管理；`pnpm install --frozen-lockfile` 安装迁入的精确依赖。
- 桌面不再分发 Codex CLI。Sparkle 2.10.1 固定官方 SHA-256，随 App 携带许可；发布文件 Ed25519 签名并经 Apple 公证。
- 迁入的 AIFi 代码及修改保留 AGPL-3.0-only；根目录 `NOTICE` 与 `LICENSE.aifi` 明确范围，既有 MIT Nomi 代码不混标。
- 不复制源仓库二进制、node_modules、账号凭据或个人数据；桌面构建在本仓库重新生成。

## 当前对应关系

- `scripts/check-action-pinning.sh`：如果 workflow 里出现浮动 tag 而不是 SHA，直接让 CI 失败。
- `.github/workflows/ci.yml`：在 PR 和 main push 上运行仓库基础检查。
- `.github/workflows/server-release.yml`：在 `server-v*` tag 或手动触发时构建并部署 server 镜像。

## 限制和前提

- Dependency Review 在 public repo 可以直接使用；private repo 通常需要 GitHub Advanced Security 或对应的代码安全能力。
- OSV、SBOM 和 provenance 的效果依赖仓库里存在可识别的依赖清单、lockfile 和真实构建产物。
- OpenSSF Scorecard 默认不启用，因为仓库还没有完整的分支保护、release 历史和 SAST 姿态可以评分；等仓库规则配置完成后再按需加回。

## 项目落地后建议继续做的事

- 锁定并提交项目真实依赖的 lockfile。
- 让构建过程尽量可重复、可验证。
- 为 server 镜像发布补 SBOM 和 provenance，并在部署前校验。
- 需要 PR 依赖门禁时，再恢复 Dependency Review / OSV workflow。
- 如果条件允许，在部署链路里增加对 provenance 的校验。
- 把 attestation 校验继续下沉到部署平台或准入层。
