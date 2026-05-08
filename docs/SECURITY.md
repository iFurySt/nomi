# 安全默认约束

这份文档用于把安全默认值讲清楚，避免实现逐步演进时越走越散。仓库级的依赖、SBOM 和 provenance 默认能力，统一写在 `docs/SUPPLY_CHAIN_SECURITY.md`。

## 数据分级

- Nomi records、图片、提取文本、Ask 问题和回答都按敏感个人数据处理。
- 当前本地开发数据只允许保存在本机 Postgres 或 mobile 本地状态里。
- 提交 history、截图和日志时不得包含真实用户身体数据、体检单、图片原件或身份信息。

## 本地凭据

- `postgres://bytedance:bytedance@localhost:5432/nomi?sslmode=disable` 只用于本地开发。
- 共享、staging、production 环境必须通过环境变量或密钥管理系统提供 `NOMI_DATABASE_URL`。
- amoylab 的真实 `NOMI_DATABASE_URL`、数据库密码和 SeedX key 只允许存在于 `/opt/nomi/.env` 或密钥系统，不写入仓库。
- SeedX daemon API key 通过 `NOMI_SEEDX_API_KEY` 或 `--seedx-api-key` 配置，真实 key 不得写入 README、history、日志或 URL。
- Apple Developer / App Store Connect 的真实 `.p8`、`.p12`、provisioning profile 和 app-specific password 不得写入仓库；如必须本机留存，只能放到已被 `.gitignore` 忽略的 `.harness/secret/apple/`。
- 不要把真实数据库 URL、SeedX token、云端 websocket endpoint secret、Apple signing secret 写入仓库。

## AI 边界

- Ask 和 extraction 只能做记录整理、趋势回顾和有来源的回答。
- 医疗诊断、治疗、药物、剂量、急症、疾病风险和异常判断必须阻断。
- 如果未来用户数据会发送到第三方 AI 服务，必须先补用户可见隐私说明和同意流程。

## API

- 当前 records / Ask API 尚未实现用户认证；`nomi.ifuryst.com` 已通过 nginx / TLS 暴露到公网，接入真实用户前必须补 API 认证、授权和审计。
- amoylab Docker Compose 只把 server 绑定到 `127.0.0.1:8088`，公网流量统一经 nginx 转发。
- SeedX websocket 在配置 `NOMI_SEEDX_API_KEY` 后要求 WebSocket 握手带 `Authorization: Bearer ...`，兼容 `seedx daemon connect --api-key`；API key 不放在 URL query。
- 接入真实 mobile client 或云端前必须增加认证、授权、请求大小限制、CORS 策略和审计日志。
- Websocket origin check 允许非浏览器 daemon client；浏览器来源必须同 host 或本地开发 host。云端模式还需要补租户绑定、短期凭据轮换和审计。

## 部署 SSH

- GitHub Actions 到 amoylab 使用专用 `nomi-deploy` key，不复用个人 root key。
- amoylab `authorized_keys` 使用 forced command 进入 `/usr/local/bin/nomi-deploy-ssh`，只允许固定的部署和健康检查命令。
- `nomi-deploy` 用户不加入 docker group；需要 root 的 Docker 操作通过 sudo 限定到固定 `/usr/local/sbin/nomi-deploy-root` 脚本。
