# 前端协作说明

当前前端位于 `apps/mobile/`，使用 React Native + Expo + TypeScript。第一阶段先以 mobile app 为主，Expo web 用作 Agent 可截图、可快速检查的本地验证面。

## 本地启动

```sh
cd apps/mobile
npm install
npm run typecheck
npx expo start --web --port 8081
```

如果要清理 Metro cache：

```sh
cd apps/mobile
npx expo start --web --port 8081 --clear
```

## 当前界面

- Home / Today：今日摘要、主记录入口、最近记录。
- Timeline：mock records、类型筛选。
- Capture：拍照、上传、手动饮食、身体数据、笔记入口，以及 AI extraction preview。
- Trends：7D / 30D / 90D 分段控件和基础趋势图。
- Ask：建议问题、mock answer、医疗边界提示。
- Settings：profile、单位、导出、删除和隐私入口。

## 设计约束

- 设计方向以 `docs/DESIGN.md` 为准：quiet、personal、less is more、Apple-like。
- 优先使用系统感强的排版、清晰留白、克制色彩和 8px 以内圆角。
- 不使用医疗 dashboard、告警、风险评分、红黄警示或诊断 / 治疗文案。
- Capture 是主动作；Ask 需要保持有来源、有边界的个人记录助手语气。

## 验收方式

- 每个 UI milestone 至少运行 `npm run typecheck`。
- 需要启动 Expo web 并检查关键屏幕能渲染和切换。
- 有明显视觉改动时，生成或保留截图证据到 `docs/generated/verification/`，并在 history 里记录命令。

## 测试策略

当前 mobile skeleton 只有 TypeScript 检查和手工 / 截图 smoke。后续 domain flow milestone 应补充可自动执行的 store、AI boundary 和 capture flow 测试。
