## [2026-05-08 16:44] | Task: CI markdownlint removal

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### User Query

> gh 看看为什么 CI 出错，修复一下

> md lint直接干掉吧，不要了！

### Changes Overview

**Scope:** GitHub Actions CI, repository hygiene, docs

**Key Actions:**

- **CI diagnosis**: 用 `gh run view` 定位最新 `main` CI 失败在 `Markdown lint` step，基础仓库检查已通过。
- **CI workflow**: 从 `.github/workflows/ci.yml` 移除 `DavidAnson/markdownlint-cli2-action` step。
- **Repo hygiene**: 从 `scripts/check-repo-hygiene.sh` 的必备文件列表移除 `.markdownlint.json`，并删除该配置文件。
- **Docs sync**: 更新 `docs/CICD.md`，不再声明 CI 覆盖 Markdown lint。
- **Docs cleanup**: 保留 TestFlight 步骤编号和 UIUX 参考链接的 Markdown 兼容整理；这些格式调整不再由 CI 强制检查。

### Design Intent

这次失败不是代码构建问题，而是 Markdown lint 对现有 history 和文档写法产生了噪音。按用户最新决策，仓库级 CI 不再运行 Markdown lint，只保留 `scripts/ci.sh` 里的基础 docs / repo hygiene / action pinning 检查。

### Files Modified

- `.github/workflows/ci.yml`
- `docs/IOS_TESTFLIGHT_RELEASE.md`
- `docs/UIUX_REFERENCE.md`
- `docs/CICD.md`
- `scripts/check-repo-hygiene.sh`
- `.markdownlint.json`
- `docs/histories/2026-05/20260508-1644-ci-markdownlint-fix.md`

### Verification

- `./scripts/ci.sh`
