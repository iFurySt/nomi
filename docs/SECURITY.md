# 安全默认约束

这份文档用于把安全默认值讲清楚，避免实现逐步演进时越走越散。仓库级的依赖、SBOM 和 provenance 默认能力，统一写在 `docs/SUPPLY_CHAIN_SECURITY.md`。

## 数据分级

- Nomi records、图片、提取文本、Ask 问题和回答都按敏感个人数据处理。
- 当前本地开发数据只允许保存在本机 Postgres 或 mobile 本地状态里。
- 提交 history、截图和日志时不得包含真实用户身体数据、体检单、图片原件或身份信息。

## 本地凭据

- `postgres://bytedance:bytedance@localhost:5432/nomi?sslmode=disable` 只用于本地开发。
- 共享、staging、production 环境必须通过环境变量或密钥管理系统提供 `NOMI_DATABASE_URL`。
- 不要把真实数据库 URL、SeedX token、云端 websocket endpoint secret 写入仓库。

## AI 边界

- Ask 和 extraction 只能做记录整理、趋势回顾和有来源的回答。
- 医疗诊断、治疗、药物、剂量、急症、疾病风险和异常判断必须阻断。
- 如果未来用户数据会发送到第三方 AI 服务，必须先补用户可见隐私说明和同意流程。

## API

- 当前 server skeleton 尚未实现认证，只能用于本地开发。
- 接入真实 mobile client 或云端前必须增加认证、授权、请求大小限制、CORS 策略和审计日志。
- 当前 websocket origin check 只允许本地开发 host；云端模式必须改为基于 daemon 身份和短期凭据的认证。
