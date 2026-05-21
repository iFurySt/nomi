## [2026-05-21 23:25] | Task: amoylab SeedX Codex service

### User request

> 把 SeedX 和 Codex 也一起部署到 amoylab；Codex 和 SeedX 账号都已在宿主机登录，只需要让 SeedX 通过 websocket 连接容器里的 Nomi server，做完后用 Nomi macOS app 试试看。

### Changes

- **[Remote daemon]**: 在 amoylab 宿主机新增并启用 `nomi-seedx.service`，常驻运行不带短 `--timeout` 的 `seedx daemon connect`，连接宿主机 loopback 上的 Nomi server `http://127.0.0.1:8088`。
- **[Remote assets]**: SeedX daemon 启动时允许 `https://nomi.ifuryst.com` 作为远端图片资产 host，使 server 透传的 `/images/...` URL 可以被宿主机 SeedX/Codex 下载分析。
- **[Infra template]**: 新增 `infra/amoylab/nomi-seedx.service`，把宿主机 systemd unit 版本化，避免只存在远端手工状态。
- **[Docs]**: 更新部署文档、架构说明和质量评分，记录 amoylab 宿主机 SeedX/Codex 服务的检查与重启方式；补齐 Nomi server、SeedX daemon bridge、Codex CLI、nginx/TLS、Postgres 和上传卷的服务清单，以及后续升级 / 回滚 / 验证命令。

### Why

线上图片识别不应该依赖开发机保持 SeedX 长连接。把 SeedX/Codex 作为 amoylab 宿主机 systemd 服务运行后，客户端只需要上传到线上 Nomi server，后端就能稳定调度同机宿主上的 SeedX daemon 完成图片分析。

### Validation

- `seedx version` on amoylab returned `0.2.1`; `codex doctor` reported configured auth and websocket connectivity.
- `seedx daemon connect --server-url http://127.0.0.1:8088 --once` reached the Nomi server websocket.
- `systemctl is-active nomi-seedx.service` returned `active`; `systemctl is-enabled nomi-seedx.service` returned `enabled`.
- Uploaded `amoylab-seedx-breakfast-smoke.png` to `https://nomi.ifuryst.com/ai/extract-image`; record `30b164ee-f30d-43ca-8956-5307c7853622` advanced to `completed` with schema `2026-05-15.seedx-codex-zh.v3`, category `food`, and server log `image extraction completed`.
- Ran Nomi macOS app with `NOMI_API_BASE_URL=https://nomi.ifuryst.com`, selected `breakfast.png` through the app file importer, and confirmed record `59b1ea70-c04a-470f-8447-98120191b4cd` advanced from `processing` to `completed` with source `macos-file` and the same schema.
- `make check-docs` passed after documenting the full amoylab service inventory and upgrade operations.

### Files

- `docs/DEPLOYMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/QUALITY_SCORE.md`
- `docs/histories/2026-05/20260521-2325-amoylab-seedx-codex-service.md`
- `infra/amoylab/nomi-seedx.service`
