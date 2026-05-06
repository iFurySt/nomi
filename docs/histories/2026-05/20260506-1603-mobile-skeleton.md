## [2026-05-06 16:03] | Task: Mobile skeleton and domain flow

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI, macOS, Expo web smoke`

### 📥 User Query

> 基于 Nomi / 知己 产品规格推进 React Native + Expo mobile app；每个 milestone 需要自行验证、截图并提交。产品要保持 niche、Apple-like、less is more，AI 边界不能落入医疗诊断或治疗。

### 🛠 Changes Overview

**Scope:** `apps/mobile/`, `docs/`

**Key Actions:**

- **[Expo skeleton]**: 初始化 `apps/mobile/` Expo + TypeScript app，并配置 Expo web 依赖和 `npm run typecheck`。
- **[Nomi UI]**: 实现 Home、Timeline、Capture、Trends、Ask、Settings 六个基础界面，使用 mock records / trends 数据和克制的 warm neutral 视觉 token。
- **[Verification]**: 运行 `npm run typecheck`，启动 `npx expo start --web --port 8081 --clear`，用 Computer Use 检查 Home / Capture / Trends / Ask，并生成移动尺寸截图 `docs/generated/verification/2026-05-06-mobile-skeleton-home.png`。
- **[Docs sync]**: 更新架构、前端说明、质量评分、README 和 active execution plan。
- **[Domain flow]**: 新增 capture record factory、本地 records 状态、Timeline 保存回看、Ask 基于 records 的回答和医疗意图阻断。
- **[Smoke test]**: 新增 `npm run smoke`，覆盖 food / body capture、summary、Ask 引用记录和医疗边界话术。

### 🧠 Design Intent (Why)

先交付一个可启动、可截图、可继续迭代的 mobile skeleton，让后续 capture store、server、daemon 和 Postgres 可以围绕稳定的信息架构推进。随后补上最薄的本地 domain flow，让用户能从 Capture 保存记录并在 Timeline / Ask 中看到结果。当前 UI 有意保持安静、轻量和个人记录感，不使用医疗 dashboard、风险评分或诊断 / 治疗表达。

### 📁 Files Modified

- `apps/mobile/App.tsx`
- `apps/mobile/src/domain/mockData.ts`
- `apps/mobile/src/domain/records.ts`
- `apps/mobile/src/domain/aiBoundary.ts`
- `apps/mobile/src/domain/capture.ts`
- `apps/mobile/src/domain/domainSmoke.test.ts`
- `apps/mobile/src/ui/theme.ts`
- `apps/mobile/package.json`
- `apps/mobile/app.json`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
- `docs/exec-plans/active/2026-05-06-nomi-mvp-skeleton.md`
- `docs/generated/verification/2026-05-06-mobile-skeleton-home.png`
