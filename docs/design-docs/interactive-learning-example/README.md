# Temperature Explorer 交互契约示例

2026-10-19：此 IR 已由 Nomi 的 React 学习工作区实际运行，并经独立 Swift 计算参考验证。示例重新选取 `logits=[2,1,0.1]`，不声称恢复了用户截图的原程序。当前手工编写 / 编辑定义，尚未接 AI 生成。

- [temperature-explorer.nomi-ui.json](temperature-explorer.nomi-ui.json)：未求值 IR，包含状态、计算、控件、绑定、动作、能力与预算。
- [reference-values.json](reference-values.json)：独立 Python 数学参考值、预期事件轨迹与验收行为。
- [运行时实现](../interactive-learning-runtime.md)：实际入口、支持边界、存储、测试与后续工作。
- [整体交互设计](../generative-interactive-content.md)：原生 renderer、OpenUI 复用边界与状态生命周期。

## 已实现的语义

状态默认 `temperature=0.85`、`mode=logit`。Slider / SegmentedControl 修改各自绑定；Reset 恢复三个声明默认值。`probabilities`、曲线和 marker 由状态派生，不通过模型请求产生。

`sampleFamily` 是 Nomi IR 的有界采样构造：按 `seriesValues` 绑定序列变量 i，在闭区间 domain 取 count 个等距 x，对每个点求 value，输出有序的 `{series, points:[{x,y}]}`。count 至少为 2，并受 budget 限制。它不是现成 OpenUI built-in；TypeScript 和 Swift 参考已独立实现。

`map` 按 items 顺序在局部变量域求 body；`match` 只接受显式 case。`derived` 按 ID 读取已声明派生表达式，计算图必须无环。`array.at` / `array.replaceAt` 和 `math.softmax` 具有严格类型 / 索引 / 数学定义域约束，无效输入产生错误。

React Slider 已实现；SwiftUI / Compose Slider 将来可映射成各自原生控件，发出相同状态事件。Plot renderer 收到相同数值序列，坐标轴和单位保持一致。程序不携带 CSS、React closure 或任意 JavaScript。

## 放入文档（待实现）

DSL 的候选引用形式如下，仍需与主格式共同验证：

```kdl
interactive "b_temperature" source="interactive/temperature-explorer.nomi-ui.json" profile="portable.learning/draft-1"
```

这个块计划放进 Note 的块列表，或由 Board 的 Placement 独立展示。个人学习状态独立于程序定义。当前 Learn 按本机 profile / program ID 保存一个实验；文档内多处展示所需的 user / document / block 实例 scope 尚未接入。

## 验证边界

`pnpm test` 验证导入校验、参考数值、事件、错误与持久化；`pnpm smoke:learning` 在实际 App / Electron 中重放控件、定义编辑 / 导入导出、刷新及错误恢复，并断言零网络请求。`pnpm check:interactive-native` 对 TS 与 Swift 的 5 个全量快照做 18,500 个数值比较，容差 `1e-9`。

没有 OpenUI 文本编译器、SwiftUI / Compose UI、协作同步或真实 iPad 输入。计算可移植不代表这些客户端能力已实现。
