# 交互学习运行时：第一轮实现

状态：2026-11-09，Electron / React 支持 draft-1 与 portable draft-2。下文早期 Learn 路由属于历史切片，当前入口为文稿 / Canvas。长期方向以 [GenUI 设计](generative-interactive-content.md) 为准。

## draft-2 当前扩展

新增 TextInput、Metric、Table、Scene 四种组件（共 12 种），string 状态声明 maxLength，`set` 动作计算并校验新值后原子更新。Scene 仅包含 rect / circle / line / text，颜色为语义 token，坐标和项目数有界；不包含原始 SVG / HTML / JS。

函数均版本 1：math.add/subtract/multiply/divide/pow/min/max/sin/cos，number.format（0..8 小数位，舍入零不显示负号），string.concat，object.get，array.length，learning.bpe；继承 draft-1 的函数。非有限计算、越界和未知能力拒绝，失败的派生计算不会污染下一次循环检测。

BPE 是教学用字符算法：最多 1024 个 UTF-16 长度单位、128 个空白分隔词、32 次合并；以 Unicode code point 起始，每词追加保留边界 `</w>`，输入不能包含此标记。重复词参与计频，邻接对计重叠频次，合并按从左到右非重叠替换。频次相同时按 JSON 编码 pair key 的 UTF-16 字典序选择。返回真实完成步数、初始 / 当前 token 数、分词、合并规则、当前 pair 频次及当前词表；`vocabulary` 仍表示当前分词频次，不是训练词表；新增 `learnedVocabulary` 返回 `[教学 ID, token, 当前频次]`，保留初始字符与所有已学习 token，当前频次可为零。初始字符按 UTF-16 字典序编号，新 token 按首次学习顺序追加；不对应任何生产 tokenizer ID。每轮消耗共享求值预算，没有后台请求。

新增能力必须显式使用 draft-2 schema / profile；旧程序不自动迁移。控件结果、定义与个人进度继续分离。输入错误按节点显示短提示，保留输入框供修正；set 动作错误不提交状态。

验证：`packages/core/src/interactive/v2.test.ts`、`node scripts/check-interactive-v2.mjs`；在线合成生成 fixture 位于 `packages/core/src/interactive/fixtures/`。Swift 参考目前只覆盖旧 draft-1；多端一致性契约不是已交付的移动 renderer。

## 2026-11-11 紧凑 presentation

在 draft-2 中，Table / Button / TextInput 新增组件 version 2，必须同时在 requires 与 node 声明。Table 提供 visibleRows、window、highlightRow 、hint/showCount/columnAlign/emptyText 与 tokens/emphasis/groups/joiners 单元格；Button 提供语义 icon、variant、disabled；TextInput 支持 hideLabel 保留无障碍名称；resetTargets 在内容变化时恢复关联状态的默认值。其余组件仍为 version 1，既有定义继续可用。

折叠不截断求值数据；输入变化会清空 BPE 步数，保留用户语料。紧凑 BPE 同源于 core、Skill 及 host 生成示例，详见 [外部 Agent 创作规范](interactive-authoring-skill.md)。React renderer 采用黑白灰与少量蓝色、两列紧凑表格及窄屏堆叠；文稿宿主不重复添加标题和外层留白。Swift 参考尚不支持这些新组件版本。

## 2026-10-19 历史切片

桌面左侧 **Learn**（`#/learn`）运行温度探索器：Slider、两种曲线模式、三个 token 的概率与 marker、LaTeX 公式、数值表和 Reset。控件计算完全在本机完成，不发送模型或网络请求。浅色、深色和窄屏沿用已有桌面外壳。

**编辑交互**打开 JSON 定义；**导入**读取不超过 256 KiB 的 `.nomi-ui.json`，经手动应用后生效；**导出**只导出当前内容与默认值。修改文案或默认值保留仍符合新约束的个人参数。非法 JSON、未知能力、坏引用、循环或超预算定义均不替换当前可用版本。存储写入失败显示错误；尚未提交的个人进度写入失败时，阻止安装新定义。

此处描述独立 Learn 实验室，每个本机 profile 一个可切换的交互块。后续同日已新增默认 [Canvas 主工作区](canvas-workspace-runtime.md)，将交互块放进笔记与画布，实例状态按 document / block 分开；不把 Learn 页面当成主界面。没有 AI 生成、OpenUI 文本编译器、协作、云同步、移动端 UI 或发布。

## 代码与协议

| 层 | 实现 | 边界 |
| --- | --- | --- |
| IR / 类型 | `packages/core/src/interactive/types.ts` | JSON 数据，不含 React、DOM、CSS、SwiftUI 或可执行源码 |
| 导入校验 | `packages/core/src/interactive/validate.ts` | 严格版本、字段、引用、树、默认值、能力与预算；默认状态先求值验证 |
| 计算与动作 | `packages/core/src/interactive/runtime.ts` | 类型约束状态、纯函数、派生值 memo、循环检测、局部变量、有界求值与 Reset |
| React renderer | `packages/ui/src/interactive/InteractiveRenderer.tsx` | 8 个通用组件映射；SVG 图表、键盘可用控件、数值表；KaTeX 禁止 trusted HTML 能力 |
| 页面与持久化 | `packages/ui/src/pages/Learning.tsx`、`packages/platform/src/learning.ts` | 定义与个人进度分开；最后可用内容保留、导入导出与失败提示 |
| Swift 参考解释器 | `packages/interactive-native/Sources/` | 独立 Foundation 实现相同计算 / 状态 / 动作，对受信 fixture 做 conformance；不作为生产导入校验器 |

运行的 profile 为 `portable.learning/draft-1`，schema 为 `nomi-interactive-ir/draft-1`，尚未承诺稳定的长期兼容性。支持：

- 组件 v1：Panel、Row、Text、Button、SegmentedControl、Slider、Math、Plot。
- 函数 v1：`math.softmax`、`array.at`、`array.replaceAt`。有限数值与严格索引；Softmax 先减最大值再除温度，拒绝非正温度。
- 表达式：literal、state、variable、derived、call、match、object、map、sampleFamily。
- 动作：user scope 的 reset；没有网络、文件、宿主或 AI 副作用，没有 `eval`。

导入硬上限：256 KiB、JSON 深度 40、20,000 个值、64 个状态 / 派生字段 / 动作、256 个视图节点、8 条曲线、每条 512 点、单次共享求值最多 100,000 步。程序可声明更小预算。当前不是通用代码语言，未声明或未支持的能力直接拒绝。运行时仍对状态与求值预算检查；状态改变触发的领域错误显示在交互区。

规范示例在 `docs/design-docs/interactive-learning-example/temperature-explorer.nomi-ui.json`；运行包包含 `packages/core/src/interactive/temperature.json`。单测要求两个 JSON 结构完全一致，更新时同时修改。独立参考数值不由被测运行时生成。

## 状态生命周期

定义 key 为 `nomi.learning.definition.v1:[profile]`，个人进度 key 为 `nomi.learning.state.v1:[profile,programId]`。profile 来自本机 ChatGPT active profile ID；未连接时为 `local-device`。这是同一 Electron / 浏览器 profile 内的组织方式，不是身份认证、加密或跨用户权限边界。

拖动期间只改内存状态，在 pointer release、keyboard release、blur 提交；页面隐藏、离开或卸载时尝试补写。Reset 修改个人状态，不把参数写回程序默认值。恢复时只保留已声明且满足类型 / 约束的字段，未知字段丢弃，不兼容字段恢复新默认值。

损坏定义保留原始文本并显示修复入口；损坏进度保留原始存储，阻止自动覆盖，用户可显式恢复默认进度。浏览器配额 / 存储失败不显示虚假成功。当前数据位于本机 localStorage，不具备 server 同步或家庭授权；未来嵌入文档须升级为 user / document / block 实例 scope，不能直接沿用 program ID 作为多实例状态键。

## 验证命令

```sh
pnpm check
pnpm test
pnpm build
pnpm smoke:desktop
# 单独运行交互学习的实际 App / Electron 回归
pnpm smoke:learning
# 需要 swiftc（本机 Swift 6.3.2）
pnpm check:interactive-native
make ci
```

Electron smoke 使用临时 profile 与合成 repositories，打开真实 App 路由，验证滑块、切换、Reset、定义编辑 / 导入 / 导出、坏输入、存储失败、兼容进度、刷新恢复及损坏进度的显式恢复，并断言无网络请求。截图与报告生成在 ignored `.artifacts/interactive-learning/`，不接触真实账号或资料。构建版桌面 smoke 另验 `#/learn` 确实可达。

Swift 和 TypeScript 读取同一份 IR 与事件 fixture，对默认状态及四步操作后的全部派生值、曲线点、节点 props 和状态进行比较，加上独立概率样例及定义域失败样例，共 18,500 个数值比较，绝对容差 `1e-9`。这是计算与动作可移植性的证据，不是 SwiftUI / Compose renderer、原生存储或跨端同步已经完成的证明。

## 下一轮

最小 Note / Block / Placement、长文编辑、画布摆放、图片 / 文件与保存重开已在 [Canvas](canvas-workspace-runtime.md) 落地，继续沿用同一 renderer。并行前置风险仍包括 OpenUI 受限文本 profile 的严格往返、真实 iPad 笔迹与可接入原生的同步核心。AI 后续只能生成 / 修改受 catalog 约束的定义，经过相同校验与显式应用；生成通道不承担每次滑块计算。
