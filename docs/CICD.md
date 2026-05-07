# CI/CD 说明

这个模板自带一套不依赖具体语言栈的 CI/CD 骨架。

## 默认包含的内容

- `ci.yml`：仓库级检查，覆盖 docs、repo hygiene、Markdown 和 shell 脚本校验。
- `supply-chain-security.yml`：在 PR 上做依赖变更检查，并在 PR、定时任务和手动触发时运行 OSV 扫描。
- `release.yml`：手动触发的 release 流水线，用来打包仓库级制品、生成 provenance，并创建 GitHub Release。
- `server-release.yml`：推送 `server-v*` tag 后构建 `apps/server` Docker 镜像，推送到 GHCR，并通过受限 SSH key 部署到 `amoylab:/opt/nomi`。

## 设计原则

这套默认流水线的目标，是在项目真正成形前先把交付链路搭起来，而不是假装已经知道未来项目该怎么 build 和 deploy。

当新项目的技术栈确定后，你应该把 `scripts/release-package.sh` 里的占位打包逻辑替换成真实构建产物，而不是另起一套平行流程。

所有 GitHub Actions 都已经 pin 到 commit SHA。后续升级 action 时，也要继续保持这个约束。

## 推荐接入顺序

1. 保留 `ci.yml`，作为唯一默认常驻的仓库基础门禁。
2. 在 `scripts/ci.sh` 里继续叠加项目自己的验证命令。
3. 用真实构建产物替换 `scripts/release-package.sh`。
4. Server 真实部署已接入 `server-release.yml`，后续 server 发版通过递增 `server-v*` tag 触发。
5. 即使交付方式变化，SBOM 和 provenance 这类供应链能力也建议保留。

## Server 发版

Server 镜像发布到 `ghcr.io/ifuryst/nomi-server`，tag 发布会同时写入 `server-v*`、`sha-*` 和 `latest` 标签。部署 job 使用仓库 secrets 中的 amoylab SSH 配置，远端 key 被 forced command 限定到固定部署脚本。

后续用户提到 server 发版时，默认执行：

```sh
git tag server-vX.Y.Z
git push origin server-vX.Y.Z
```

然后观察 GitHub Actions 的 `Server 发布` workflow 和 amoylab `/opt/nomi` 服务健康状态。详细步骤见 `docs/DEPLOYMENT.md`。

## 默认 release 产物

当前 release 流水线会产出：

- `release-manifest.json`
- `repo-metadata.tgz`
- `sbom.spdx.json`
- 对 release artifact 生成的 GitHub artifact attestation

也就是说，即使项目还没进入真实部署阶段，这个模板也已经把“可追溯的制品封装”这一步准备好了。
