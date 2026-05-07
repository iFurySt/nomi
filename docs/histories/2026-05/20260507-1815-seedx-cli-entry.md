## [2026-05-07 18:15] | Task: SeedX CLI entry

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### User Query

> 后续 SeedX 直接通过 CLI 运行，不再通过 `../seedx` 源码运行；如果 `seedx` 不满足或有问题，可以提出来驱动 SeedX 修改。

### Changes Overview

**Scope:** `README.md`, `apps/server/README.md`, `docs/`

**Key Actions:**

- **[SeedX entry]**: 将 Nomi 文档中的 SeedX 本地运行命令统一改成 `seedx daemon connect ...`。
- **[Source boundary]**: 移除当前验证入口里对相邻 `../seedx` 源码目录和 `go run ./cmd/seedx` 的依赖说明。
- **[Dogfood feedback]**: 在稳定性文档中补充：Nomi smoke 发现 SeedX CLI 能力缺口或行为问题时，应记录并反馈用于驱动上游修改。

### Design Intent (Why)

Nomi 当前是 SeedX CLI 的 dogfood 使用方，不应该要求 Agent 进入 SeedX 源码仓库运行 daemon。把运行入口收敛到安装好的 `seedx` 命令，可以让 Nomi 文档更接近真实用户路径，也把 SeedX 自身的内部测试责任留在 SeedX 仓库。

### Files Modified

- `README.md`
- `apps/server/README.md`
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `docs/QUALITY_SCORE.md`
- `docs/exec-plans/completed/2026-05-06-nomi-mvp-skeleton.md`
- `docs/histories/2026-05/20260507-1815-seedx-cli-entry.md`
