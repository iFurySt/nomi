# amoylab server 部署

## 目标

把 Nomi Go server 部署到 `amoylab:/opt/nomi`，通过 GitHub tag 发布 GHCR 镜像并自动 SSH 到 amoylab 拉取、升级和清理旧镜像。

## 范围

- 包含：server Dockerfile、amoylab Docker Compose、GHCR 发布 workflow、受限 SSH deploy key、远端 Postgres `nomi` database / role、部署和发版文档。
- 不包含：公开域名、TLS、用户认证、反向代理和 records / Ask API 权限体系。

## 背景

- 相关文档：`docs/CICD.md`、`docs/SECURITY.md`、`docs/SUPPLY_CHAIN_SECURITY.md`
- 相关代码路径：`apps/server/`、`.github/workflows/`、`infra/amoylab/`
- 已知约束：server records / Ask API 尚未认证，所以 amoylab compose 默认只绑定 `127.0.0.1:8088`。

## 风险

- 风险：GitHub Actions SSH key 权限过大。
- 缓解方式：使用专用 `nomi-deploy` 用户，authorized_keys forced command 进入固定 wrapper，再通过 sudo 只运行固定 root deploy script。
- 风险：GHCR 旧镜像持续占用服务器磁盘。
- 缓解方式：部署脚本升级后按 `org.opencontainers.image.source=https://github.com/iFurySt/nomi` label 清理未使用旧镜像。
- 风险：远端 Postgres 已承载其他服务。
- 缓解方式：只新增 `nomi` database 和 role，不改现有 postgres compose 和已有库。

## 里程碑

1. 补仓库内 Docker / Compose / workflow / 文档。
2. 初始化 amoylab `/opt/nomi`、Postgres role 和受限 SSH deploy key。
3. 提交推送并打 `server-v*` tag 触发发布。
4. 观察 GitHub Actions 与 amoylab health。

## 验证方式

- 命令：`make check-docs`、`make ci`、`cd apps/server && go test ./...`
- 手工检查：GitHub secrets 存在；amoylab `/opt/nomi` 文件权限和 deploy key forced command 生效。
- 观测检查：GitHub Actions `Server 发布` 成功；amoylab `nomi-server` 容器 running / healthy；`GET /health` 返回 database ok。

## 进度记录

- [x] 完成仓库内部署文件。
- [x] 完成 amoylab 初始化。
- [x] 完成 commit / push / tag。
- [x] 完成 GitHub Actions 和远端健康检查。

## 决策记录

- 2026-05-07：在认证补齐前，amoylab server HTTP 只绑定本机回环地址，避免把未认证 records / Ask API 直接暴露到公网。
- 2026-05-07：首轮 tag 发布已成功推送 GHCR 镜像，但 server 通过 host gateway 连接 Postgres 时启动前连接不稳定；改为加入现有 `postgres_default` Docker network，并用 `postgres:5432` 连接数据库。
- 2026-05-07：`server-v0.1.1` 发布成功，GitHub Actions run `25495176882` 完成；amoylab `nomi-server` healthy，镜像 label 指向 commit `29dc60d7d1c657bc053eb069860bb3e378659808`。
