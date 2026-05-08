## [2026-05-08 16:44] | Task: CI markdownlint fix

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### User Query

> gh 看看为什么 CI 出错，修复一下

### Changes Overview

**Scope:** `docs`, repository lint config

**Key Actions:**

- **CI diagnosis**: 用 `gh run view` 定位最新 `main` CI 失败在 `Markdown lint` step，基础仓库检查已通过。
- **Markdown lint config**: 将 `MD024` 配置为只检查同级重复标题，适配 history 文件按多条任务记录复用小节名的写法。
- **TestFlight docs**: 将跨代码块拆分的发布步骤编号改为 markdownlint 认可的 `1.` 形式。
- **UIUX docs**: 将官方参考和外部参考的裸 URL 改为 Markdown 链接，保留原参考入口。

### Design Intent

这次失败不是代码构建问题，而是文档 lint 规则和已有文档写法不匹配。重复小节标题只在不同 task section 下出现，按同级标题检查即可保留 history 可读性；裸 URL 和被代码块拆开的列表则直接改成 markdownlint 兼容写法。

### Files Modified

- `.markdownlint.json`
- `docs/IOS_TESTFLIGHT_RELEASE.md`
- `docs/UIUX_REFERENCE.md`
- `docs/histories/2026-05/20260508-1644-ci-markdownlint-fix.md`

### Verification

- `./scripts/ci.sh`
- `npx markdownlint-cli2 '**/*.md'`
