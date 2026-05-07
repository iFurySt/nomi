## [2026-05-07 15:28] | Task: UIUX reference standards

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI / zsh`

### User Query

> 将前面提供的设计标准和参考链接沉淀到对应 docs，并按需更新 AGENTS.md，让后续开发 UIUX、动画效果和视觉语言时可以持续统一。

### Changes Overview

**Scope:** `docs/`、`AGENTS.md`

**Key Actions:**

- **UIUX reference entry**: 新增 `docs/UIUX_REFERENCE.md`，集中维护 Nomi 移动端 UIUX 标准、官方参考链接、本地设计图入口、visual tokens、layout、motion、组件规则和验收清单。
- **Docs routing**: 更新 `docs/DESIGN.md`、`docs/FRONTEND.md`、`docs/design-docs/index.md` 和 `docs/references/README.md`，把设计原则、前端实现约束、设计图归档和外部参考统一路由到 UIUX reference。
- **Agent routing**: 更新 `AGENTS.md`，要求涉及用户可见界面、动效、底部导航、timeline、上传 sheet 或 design token 的任务按需先读 `docs/UIUX_REFERENCE.md`。

### Design Intent (Why)

UIUX 规则如果只存在聊天上下文里，后续 Agent 会反复漂移。新增单一入口后，产品气质、动画强度、底栏交互、timeline 对齐、颜色 token 和验证截图都能被后续开发直接引用，减少每轮重新解释。

### Files Modified

- `AGENTS.md`
- `docs/UIUX_REFERENCE.md`
- `docs/DESIGN.md`
- `docs/FRONTEND.md`
- `docs/design-docs/index.md`
- `docs/references/README.md`
