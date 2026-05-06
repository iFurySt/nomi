# 前端协作说明

当前前端位于 `apps/mobile/`，使用 React Native + Expo + TypeScript。第一阶段先以 mobile app 为主，Expo web 用作 Agent 可截图、可快速检查的本地验证面。

## 本地启动

```sh
cd apps/mobile
npm install
npm run typecheck
npm run smoke
npx expo start --web --port 8081
```

如果要清理 Metro cache：

```sh
cd apps/mobile
npx expo start --web --port 8081 --clear
```

## 当前界面

- Snap / Capture：默认主入口。用户先拍照或从相册选择，随后查看 AI review card；记录类型、子类型、时间段、分量和置信状态都优先用 chips / tiles 选择，名称输入是可选项。
- Log / Calendar：月历作为记录概览，突出当天缩略视觉、Add Record 主按钮、今日 summary、统计 strip、本地 records 筛选和最近记录。
- Review / Insights：统计分段控件、日记录柱状图、类型占比和 Ask Nomi。Ask 仍基于本地 records 生成 mock answer，并保留引用记录和非医疗边界。
- Capture 保存后会立即插入本地 records，并跳转到 Log；当前仍是本地内存数据，尚未接入 server persistence。

## 设计约束

- 设计方向以 `docs/DESIGN.md` 为准：quiet、personal、less is more、Apple-like。
- 当前视觉参考 flomo / indie iOS tools：大留白、柔和背景、陶土色主动作、浮动底栏、轻量 shadow、图片记录感，但仍遵守 8px 以内卡片圆角。
- 优先使用系统感强的排版、清晰留白、克制色彩、图标按钮和选项控件；Capture 里尽量让用户选择而不是输入。
- 不使用医疗 dashboard、告警、风险评分、红黄警示或诊断 / 治疗文案。
- Capture 是主动作；Ask 需要保持有来源、有边界的个人记录助手语气。

## 验收方式

- 每个 UI milestone 至少运行 `npm run typecheck`。
- 触及 domain flow 或 AI boundary 时运行 `npm run smoke`。
- 需要启动 Expo web 并检查关键屏幕能渲染和切换。
- 有明显视觉改动时，生成或保留截图证据到 `docs/generated/verification/`，并在 history 里记录命令。当前 UIUX 改版截图：`docs/generated/verification/mobile-uiux-capture-2026-05-06.png`。

## 测试策略

当前 mobile app 有 TypeScript 检查、domain smoke 和手工 / 截图 smoke。后续应把 capture store、AI boundary 和 timeline filtering 升级为更完整的自动化测试。
