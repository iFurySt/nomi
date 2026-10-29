# OpenUI 与 Open Intelligent UI 源码评估

评估日期：2026-10-18。用户提供两个本地 checkout；本轮仅阅读，没有修改参考仓库或安装其依赖。此处记录源码事实及对 Nomi 的适用边界，不把静态阅读称为运行验证。

## 版本与分工

| 仓库 | 检查版本 | 实际角色 |
| --- | --- | --- |
| OpenUI | `8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5` | 语言规范、框架无关 parser / evaluator、状态、组件库描述、renderer 及工具 / 动作适配 |
| Open Intelligent UI | `03213439358bf3408ad61a46ec9e3230c5572e48` | 建在 OpenUI 上的 Next.js / React 示例应用、交互组件、函数与生成提示 |

两者是协议与应用的关系，不是两个必须二选一的竞品内核。

## 可复用的机制

1. **语言与渲染分离。** `packages/lang-core/src/runtime/evaluator.ts` 不依赖 React；`packages/react-lang/src/Renderer.tsx` 把组件库、状态、工具与流式内容接起来。[evaluator](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/lang-core/src/runtime/evaluator.ts)、[Renderer](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/react-lang/src/Renderer.tsx)
2. **交互在客户端执行。** 语言区分 `$state`、派生表达式、`@Set` / `@Reset` 与宿主效果；参考应用 Slider 通过 `useStateField` 双向绑定值。用此分层可以构造无需每次调用模型的学习工具。[语言规范](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/spec/language.md)、[Slider](https://github.com/thesysdev/open-intelligent-ui/blob/03213439358bf3408ad61a46ec9e3230c5572e48/src/lib/components/controls.tsx)
3. **模型面向组件 schema 生成。** 示例 library 组合控件、图表、Math、Map、SVG 与自定义函数，而非只返回 HTML。[library](https://github.com/thesysdev/open-intelligent-ui/blob/03213439358bf3408ad61a46ec9e3230c5572e48/src/lib/library.ts)
4. **跨实现的一致性测试。** 规范把语法 / 求值测试与动作 / 交互测试分成两个层次，有输入文本、期望 JSON 和事件；适合借鉴为 Swift / Kotlin / TS 的同源契约。[fixtures 说明](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/spec/fixtures/1.0/README.md)
5. **原生组件参考。** React Native 示例用同一语言和 native components 渲染。它验证的是该路线存在，不证明完整纯 SwiftUI / Compose 实现已经包含在仓库中。[React Native 示例](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/examples/app-frameworks/react-native/README.md)

## 对 Nomi 的关键差异

| 源码事实 | 对长期笔记 / 教学内容的影响 |
| --- | --- |
| `spec/language.md` §3 规定 JavaScript 风格转换、宽容恢复及除零返回 0 | 原生需要遵守明确语义；教学计算先用严格输入及专用函数约束，不能静默把错误当成正确数值 |
| §4 流式 parser 可补齐未结束字符串 / 括号 | 可用于草稿预览；持久发布必须另做完整严格检查 |
| §7 edit 按 statement name 替换，`name=null` 删除，并清理部分不可达 statements | 是生成源码 patch，不提供多端 CRDT、并发权限或全部内容删除语义 |
| §9 的 rendered-tree serialization 不 round-trip query / mutation | 长期内容需要保留完整未求值程序，不能只存求值后的 UI tree |
| 参考 Button 缺 action 时可把标签发送给 assistant | Nomi 学习控件必须显式声明 AI 请求，普通本地交互不应自动产生推理 |
| 参考 input 状态名可以来自 label / statement / React useId | Nomi 需要持久 state ID / node ID，重命名文案或切平台不改变个人状态 |
| 参考函数含 Math.random / 时间等非纯来源 | portable learning profile 需要 seed、显式时间和版本化计算，不把机器环境当隐藏输入 |
| HtmlView 使用 `sandbox="allow-scripts"` iframe，CSP 允许部分外部资源 | 是 Web 扩展，不是可独立原生执行的领域语义；不可拿它覆盖所有 GenUI 场景 |

相关来源：[规范](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/spec/language.md)、[控件](https://github.com/thesysdev/open-intelligent-ui/blob/03213439358bf3408ad61a46ec9e3230c5572e48/src/lib/components/controls.tsx)、[函数目录](https://github.com/thesysdev/open-intelligent-ui/blob/03213439358bf3408ad61a46ec9e3230c5572e48/src/lib/functions/index.ts)、[HtmlView](https://github.com/thesysdev/open-intelligent-ui/blob/03213439358bf3408ad61a46ec9e3230c5572e48/src/lib/components/html-view.tsx)。

## 建议

先做最小 Nomi catalog、portable profile、未求值 IR 和测试 fixtures，以 OpenUI core / React 实现验证 Temperature Explorer。然后判断可支持的作者语法子集、compiler 和持久语义之间是否能完整映射，再决定生产依赖。

不直接搬运云端账号路径、Next.js 应用、整套组件样式、默认副作用和任意脚本执行。参考项目的 MIT 标记不等于本轮已经做完依赖 / 制品审查；真正引入依赖时按仓库供应链流程处理。

设计决定与实施顺序见 [生成式交互内容设计](../design-docs/generative-interactive-content.md)。
