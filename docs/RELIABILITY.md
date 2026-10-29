# 稳定性与可运维性

## Electron 桌面

- Go 子进程拥有 SQLite / 调度，Node host 拥有子进程生命周期与 ChatGPT / Codex；退出时停止任务并关闭子进程。
- 来源数据先落盘再读取；空数据、失败、过期与示例必须区分。聊天只有完整成功的回答才持久化，取消和中断保持可重试。
- 正常桌面单实例；smoke 使用临时 profile、合成 transport 与空 store，产物留在 ignored `.artifacts/`。
- 桌面本地账号 / 数据与 server 独立，备份不能只包含 Electron localStorage；本地 SQLite、ChatGPT 密文和密钥、Codex thread 需要一致处理。
- 构建、测试与当前限制见 `docs/DESKTOP.md`；本轮无桌面发布与跨端同步。

## Server

- `GET /health` 同时报告 server 与 Postgres 状态。
- 启动时自动创建 V1 schema；当前从旧 records 版本升级是有意的破坏性迁移。
- HTTP 使用 5 秒 header timeout、70 秒 read timeout、10 分钟 write timeout和 10 秒优雅退出。
- Zap 日志记录 job id、kind、household id、耗时和稳定错误；不得记录 token、原始资料内容或 Codex auth。

## 持久任务

- job 状态为 `queued`、`processing`、`completed`、`failed`。
- worker 用数据库 claim 和 `SKIP LOCKED`，启动时回收超过 10 分钟的 processing job。
- 原件 materialize 与最终归档按 asset ID 幂等；ai-vault index 不重复追加同一 asset。
- 旧知识库导入按目标相对路径和内容 hash 幂等：相同内容跳过，不同内容拒绝覆盖；`knowledge_entries` 按 household + source path upsert。
- Agent result 的 `open_questions` 与 `citations` 在持久化前统一规范为 JSON `[]`，不得以 `null` 破坏移动端 projection 解码；iOS 同时对旧数据中的 null/missing 字段容错。
- `raw-data/_incoming` 被 git ignore，失败任务不会被后续无关 commit 带入历史。
- 当前失败任务不会自动无限重试，用户可看到稳定错误；后续应增加显式 retry API 和退避策略。

## SeedX/Codex

- `seedx daemon connect` 由 systemd 常驻并自动重启。
- Nomi 默认 `low` reasoning effort；真实 smoke 中 ingest 和 chat 均在 SeedX 0.2.1 的 60 秒 daemon 上限内完成。
- Nomi 的 `NOMI_SEEDX_COMMAND_TIMEOUT` 是服务端等待上限；SeedX 0.2.1 仍有独立 60 秒内部上限，两者不能混为一谈。
- daemon 不在线时 job 明确失败为 `seedx_unavailable`，不会伪造分析。

## 数据与恢复

- `/opt/nomi/data` bind mount 同时保存 assets 和 household workspaces；Postgres 独立持久化。
- 发布前后要验证 data bind、workspace cwd 和容器 UID 写权限。
- 备份必须同时覆盖 Postgres 与 `/opt/nomi/data`，并以同一恢复点为目标。
- 一次性历史导入先保留只读 staging，并在变更前生成 Postgres dump；目标 workspace 原本不存在时要把这一事实记录为恢复边界。

## 验证

```sh
cd apps/server && go test ./...
make ci
curl -fsS https://nomi.ifuryst.com/health
ssh amoylab 'systemctl is-active nomi-seedx.service'
ssh amoylab 'docker logs --since 10m nomi-server'
```

## 当前短板

- 缺 Postgres 自动集成测试、metrics、traces、queue depth/age 指标和告警。
- 缺生产备份恢复演练与 job 手工 retry 管理面。
- SeedX daemon command timeout 需要上游配置化。
