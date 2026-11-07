## 2026-11-07 15:54 | Task: 文稿侧栏分隔线使用中性灰反馈

### Execution Context

- Agent ID: `/root`
- Base Model: GPT-6
- Runtime: Codex desktop

### User Query

> 对齐参考截图，侧栏分隔线悬停后仅灰色加深，不要蓝色。

### Changes / Design Intent

- `packages/ui/src/writing/writing.css`：反馈线宽从 2px 收为 1px，悬停、键盘聚焦及拖动改用主题边框色与灰色混合，不再引用强调蓝。
- 保留原有 8px 命中区、列宽调整逻辑与光标，视觉更克制而不缩小可操作范围。
- `docs/UIUX_REFERENCE.md`：记录分隔线规范。

### Validation

- `pnpm build`、`git diff --check` 通过。
- 已确认开发版保存后退出、重启 Nomi(Dev)，实际点击侧栏分隔线并检查截图，线条为细灰色加深；正式版与用户正文未修改。
