## [2026-06-08 16:57] | Task: remove unused CI/CD

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### 📥 User Query

> 删除无用的cicd，然后提交推送

### 🛠 Changes Overview

**Scope:** GitHub Actions, repository automation, docs

**Key Actions:**

- **[CI/CD cleanup]**: 删除模板遗留的通用 release workflow、supply-chain workflow、dependency review 配置和占位 release package 脚本。
- **[Repo checks]**: 更新 `Makefile` 和 repo hygiene 检查，保留真实使用的基础 CI 与 server release workflow。
- **[Docs]**: 同步 CI/CD、供应链安全、安全说明和协作文档，避免继续描述已删除的占位流水线。

### 🧠 Design Intent (Why)

Nomi 当前已有真实 server tag 发布链路，通用仓库 release、SBOM/provenance 和依赖扫描 workflow 仍是模板占位，容易制造误导和维护噪音。先保留正在使用的 CI 与 server 发布入口，后续需要时再基于真实构建产物补回供应链能力。

### 📁 Files Modified

- `.github/workflows/release.yml`
- `.github/workflows/supply-chain-security.yml`
- `.github/dependency-review-config.yml`
- `scripts/release-package.sh`
- `Makefile`
- `scripts/check-repo-hygiene.sh`
- `docs/CICD.md`
- `docs/SUPPLY_CHAIN_SECURITY.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/SECURITY.md`
- `AGENTS.md`
- `docs/histories/2026-06/20260608-1657-remove-unused-cicd.md`
