# 个人云同步运行说明

2026-11-15：正在按阶段实施，未发布。设计与默认调度见 [cloud-sync.md](cloud-sync.md)，验收进度见 [执行计划](../exec-plans/active/20261115-personal-cloud-sync.md)。

## 当前入口与边界

桌面 Settings → 云同步。默认关闭，不登录不产生同步请求；服务不可用或同步状态损坏不阻止本地编辑。账号独立于 ChatGPT，以私有服务的运维账号登录。远程必须 HTTPS，loopback 开发可 HTTP。

首次明确选择上传到新云库，或下载已有云库；下载前备份当前本地资料库。不会按文稿标题猜测合并。同步身份包含服务、账号、云库和实际资料目录；切换目录会暂停旧绑定。退出只停用并删除本机登录凭据，保留本地文稿、outbox 和基线；联网时撤销当前设备会话，离线退出可在其他已登录设备撤销旧会话。

host 使用 Electron safeStorage 加密凭据，安全存储不可用时不保存明文替代品。renderer 只拿账号摘要、操作结果和显式请求的冲突内容，不拿 token。同步 sidecar 位于独立 userData/cloud-sync；正式版、开发版与隔离测试 profile 各自独立，不写入可携带的 `.nomi` 包。

## 本地事务与恢复

core 定义实体投影、三方比较与可控时钟调度；host 持久化冻结的 request ID / payload，写入和目录 fsync 完成才发请求。确认只更新该批次的实体基线，不推进拉取游标，不清掉新一代输入。请求成功但响应丢失后重试原请求；409 明确未提交才可换新请求。

接收端先合并已知基线、本机持久内容与远端变化，再通过当前编辑会话检查 revision、正文内容、输入法组合和待保存状态。任何新输入都拒绝这次远端应用，稍后重新计算；不会直接覆写编辑器文件。远端应用后清除早于该事务的整文稿 Undo 快照，避免旧快照还原时静默覆盖云端改动；之后的新编辑仍可撤销。

同实体冲突以本地 sidecar 保存双方与基线，设置页可查看并选择。选择前重新检查云端版本与本地内容；有后续编辑时要求重新查看。时间戳显示精度不构成竞争修改。选择前另保留该冲突副本。当前切片为库级待处理批次；跨文稿队列细化、历史入口和保留清理仍在后续实施中，不能当作完整同步交付。

## 验证

- `./scripts/test-sync-server.sh`：隔离 PostgreSQL 18、Go race、身份 / 版本 / 对象异常。
- `node scripts/check-sync-package.mjs`：真实 Go API、独立原生资料目录、原件摘要与单块增量。
- `node scripts/check-sync-package.mjs --desktop`：真实服务 + 两个 Electron 进程；独立 userData、资料目录、设备 ID 和登录凭据。覆盖默认关闭、实际登录表单、不同块离线汇合、同块冲突 UI 选择、重启和停用后本地编辑；产物写入忽略的 `.artifacts/sync-package`。
- `pnpm exec vitest run packages/core/src/sync packages/host/src/sync-engine.test.ts`：调度时钟、三方合并、冻结 outbox、丢确认 / 在途输入、编辑器竞争、旧游标重建和过期冲突选择。

所有 fixture 为 synthetic 文稿，本机双进程不代表双物理 Mac。未访问正式版资料，不为本轮测试创建远端生产部署。
