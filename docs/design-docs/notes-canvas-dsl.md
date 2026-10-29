# 笔记画布 DSL 草案

状态：设计草案 1（加入交互内容要求），2026-10-18。语义 schema 暂标 `nomi 1`，还没有 parser、codec 或运行时实现，不是已冻结的文件协议。整体设计见 [笔记与无限画布](notes-infinite-canvas.md)；GenUI、状态与原生 renderer 的新增约束见 [交互内容修订](generative-interactive-content.md)。

## 语言边界

Nomi DSL 是声明式文档语言，定义 Note、内容块、画布、摆放、附件和它们之间的关系。交互块还表达状态、类型化计算、数据绑定、声明式事件与能力请求。DSL 不记录原始鼠标轨迹或 DOM，不执行任意宿主代码；笔迹点列不必全部进入模型上下文。

文档层继续验证 KDL 2：节点名 + ID 参数 + 属性 + 子节点；交互层优先验证 OpenUI 作者前端并映射为 Nomi 的平台中立 IR，文本语法尚未冻结。Nomi 自己定义领域 schema、校验、版本与迁移。KDL 的合法语法并不等于合法 Nomi 文档，例如 `#nan` 虽是 KDL 值，在 Nomi 坐标里必须拒绝。[KDL 2 规格](https://kdl.dev/spec/)

第一版是文件化文档包。DSL 是必需的公开文档表示；Markdown 原文和通用笔迹是同一包的内容部分。数据库索引、图库缩略图、画布库私有 snapshot 都不能替代它。

## 文档包

```text
<document-folder>/
  document.nomi
  text/
    <markdown-block-id>.md
  ink/
    <ink-block-id>.ink.json
  interactive/
    <interactive-block-id>.nomi-ui.json  # 当前仅 IR 草案示例
  assets/
    <opaque-asset-file>
  .nomi-state/              # 运行时协作身份、日志与 checkpoint，不是正文
  .cache/                   # 可丢弃的预览、索引、派生识别
```

导出的可移植包包含文档、正文、笔迹、交互程序和附件部分，运行状态可以另作完整备份。导入只含正文的包可以新建一份可编辑文档，但不能把它当作原同步流的连续历史。恢复既有协作身份必须有匹配的 checkpoint / 日志。

Space 授权信息、token、本机绝对路径、设备相机和选区不进入这个包。Document ID 不意味着读写权限，授权由宿主和服务端决定。

## 最小语义

一个文件必须有 `nomi 1` 和一个 `document`。`document` 内包含 Note、可独立存在的 Block、Board 和 Asset 声明。

```kdl
nomi 1

document "d_example" title="学习笔记" {
  note "n_example" title="一个完整笔记" {
    markdown "b_text" source="text/b_text.md"
  }
  board "c_main" {
    place "p_note" content="n_example" x=0 y=0 width=640 height="auto" order="a0"
  }
}
```

- 所有语义对象 ID 在 Document 内唯一，创建后不因改名、移动或重排改变。实际生成使用随机 ID；例子中的短 ID 仅为可读。
- 标题可省略，不从正文标题强制推导；当前 JSON 运行时用空字符串表示无标题，现存标题保持原值。
- Note 的子节点顺序就是阅读顺序；首版每个 Block 最多属于一个 Note。脱离 Note 的 Block 可作为 Document 的直接声明。
- Place 可以引用本 Document 内的 Note 或 Block，不引用另一个 Place。复制 Place 不复制内容。
- Board 的叠放由 `order` 表达，不依赖声明顺序；排序键冲突按 Place ID 确定性排序。`order` 的生成 / 并发移动策略需要独立算法验证。
- 同一 Block 可以被一个 Note 和多个 Place 引用。跨文档引用与嵌套 Frame 不属于这个最小文件语法。当前 JSON IR 已支持 Block 复用与可选 Note.parentId 文稿层级（详见画布运行时），不表示这份历史 KDL 草案已具备 parser。

## 各类声明

| 声明 | 必需字段 | 可选字段与语义 |
| --- | --- | --- |
| `document` | ID、`title` | 语义版本由文件头定义 |
| `note` | ID | 可选 `title`，默认无标题；有序 Block 子节点 |
| `markdown` | ID、`source` | 原始 UTF-8 Markdown 文件 |
| `image` | ID、`asset` | `caption`；原始图片由 Asset 持有 |
| `file` | ID、`asset` | `label`；打开 / 预览由受控宿主处理 |
| `ink` | ID、`source`、`width`、`height` | 通用笔迹的逻辑范围，不是截图 |
| `interactive` | ID、`source`、`profile` | 完整未求值程序 / IR，包含版本化状态、计算、视图和动作 |
| `board` | ID | `title` |
| `place` | ID、`content`、`x`、`y`、`width`、`height`、`order` | `height` 为正数或 `"auto"`；自动高度首版只用于 Note / Markdown |
| `asset` | ID、`path`、`media`、`sha256`、`bytes` | `name` 是显示名，不能作为身份 |

所有位置和尺寸使用逻辑单位，100% 缩放时对应 CSS 逻辑像素。位置可为负；尺寸必须为正且数值有限。DPR、页面滚动位置和屏幕分辨率不参与序列化。首版不提供旋转、任意仿射矩阵或可执行布局表达式。

## Markdown 与 LaTeX

`source` 直接指向普通 Markdown，保留原文，不先转换为富文本 HTML 再反向猜测。首版约定标题、段落、列表、引用、代码块、链接、基础表格、行内数学 `$...$` 与展示数学 `$$...$$`；具体 Markdown 方言与数学支持列表在 codec / renderer 实验中固定。

Markdown 块内的插图先通过独立 Image Block 混排。粘贴普通 Markdown 的本地图片链接时，导入器需要将目标复制进受控 Asset，再保留或转换为受支持引用，不能留下绝对本机路径。远端链接不因渲染而获得任意抓取能力。

不承诺任意 HTML、LaTeX 包、宏环境和富文本属性都可 round-trip。数学语法错误不影响其他块保存；公式源码始终可编辑。

## 笔迹数据

草案中的 `.ink.json` 保存一个 Ink Block 的通用内容，结构示意：

```json
{
  "schema": "nomi-ink",
  "version": 1,
  "width": 640,
  "height": 240,
  "strokes": [
    {
      "id": "s_one",
      "brush": "pen",
      "brushVersion": 1,
      "color": "#222222",
      "width": 2.5,
      "points": [
        { "x": 20, "y": 40, "t": 0, "p": 0.4 },
        { "x": 60, "y": 55, "t": 12, "p": 0.7 }
      ]
    }
  ]
}
```

`x/y` 为块本地逻辑坐标，`t` 为本笔开始后的毫秒，`p` 为经过适配器校准的 0–1 压力；不提供压力的输入使用明确的设备默认值，并记录采样来源。未来倾角 / 方位字段有明确单位和坐标系后再加入。采样点不能是预测输入；renderer 可生成平滑曲线与 outline，但算法和笔刷版本要可识别。

点列是机器可读内容，不要求大模型直接逐点生成。AI 可读取摘要、选定笔画的局部数据与图片；识别文字另存派生结果，引用 stroke ID 和源 hash。将 JSON 换为有界、版本化的紧凑向量编码是未来优化，必须保留等价的公开解码 / 可编辑能力。

通用数据不能遗漏原生变换或擦除后的可见几何。第一版只接受经过转换验证的笔刷与整笔删除；保留原生原件不能成为丢掉通用内容的借口。

## 生成式交互块

`interactive` 与 Markdown / Image / Ink 同级，可在 Note 中混排或由 Place 展示。定义保留状态声明、表达式图、组件节点及稳定 ID、动作和能力版本；不能只保存最终 HTML 或某次求值后的数值。当前 `.nomi-ui.json` 已在 Learn / Canvas 中运行，文档结构也有 [JSON IR 实现](canvas-workspace-runtime.md)，但都尚未冻结为长期生产编码；本节文件化 KDL 前端仍待实现。

程序定义与默认值随文档版本化；个人输入 / 答案是独立 user-scoped 状态；hover / 拖动中间值等是临时视图状态。导出教材包含程序和所需数据，个人进度是否打包必须显式选择，不能默认泄露给教材接收者。

修改组件文案不改变 ID，不重置学习状态；修改参数类型需要迁移。AI 的完整生成和增量 patch 先做严格检查，再转为语义修改；流式补齐的预览不直接覆盖已保存程序。DSL 的语义 round-trip 需包括未求值计算和动作，不能使用会丢掉它们的 rendered-tree serializer。

参考 [交互内容设计](generative-interactive-content.md) 与 [Temperature Explorer IR](interactive-learning-example/README.md)。

## 附件与原件

当前 JSON IR 的 image block 已支持可选 `caption`（最多 2,000 字普通文字），通过 `set_image_caption` 原子命令修改；说明属于块，不修改 Asset 文件名、原件或摘要。文稿与 Canvas 共用此字段，空值移除，结构导出保留。

`asset` 声明引用包内不可变文件，digest 与长度可核验。图片 / 文件可以复用一个 Asset，但权限依旧由 Document / Space 决定，不提供跨用户公开 hash 地址。源附件不嵌入 Base64 到 DSL。

`path` 和 `source` 必须为规范化相对路径，拒绝绝对路径、`..`、symlink 逃逸和同路径不同内容。文件名不等于安全 MIME；实际宿主还需要内容验证与预览隔离。资源未下载时可以有 manifest，界面必须显示 pending / unavailable。

## 版本和一致性

DSL 快照的 `contentHash` 覆盖规范化语义、所有正文 / Ink / Interactive source 与附件 digest；不覆盖本地相机、缩略图、OCR 索引或协作内部 ID。运行时 checkpoint manifest 额外记录 CRDT frontier、snapshot hash 与持久日志位置，它不混进可移植正文。

保存边界：增量 durable commit → 更新内存已保存位置 → 生成临时 DSL / 正文快照 → 发布带匹配 manifest 的完整快照。崩溃后只认完整发布的版本，再重放后续日志；缓存文件时间不能决定覆盖顺序。

`parse(serialize(model))` 必须保留全部受支持语义，连续 format 输出稳定。正文不改写为不同 Markdown；formatter 可以规范化 DSL 空白和属性顺序，但 Note 子节点顺序不能排序。未知扩展必须原样保留；不支持的必需特性以只读占位打开，禁止保存时静默丢弃。未来主版本只读或显式迁移，旧客户端不能重写成自己的旧格式。

运行时文本类型不等于整份 DSL 的字符串。以单个巨大 `Y.Text` 保存所有节点语法，再由拖动不断重写整份文件，会制造语法中间态和不必要冲突；内部按对象 / 正文协作，DSL 负责确定性表示。

## AI 修改事务

读取返回 Document / Note / Block / Place IDs、内容版本和按需正文；写入接受领域命令，不开放原始数据库更新。示意请求：

```json
{
  "documentId": "d_example",
  "baseVersion": "opaque-causal-version",
  "requestId": "unique-change-id",
  "operations": [
    {
      "type": "splice_markdown",
      "blockId": "b_text",
      "expectedText": "需要补充",
      "replacement": "补充后的解释",
      "expectedHash": "hash-of-the-read-block"
    }
  ]
}
```

这只是设计中的接口形状。`baseVersion` 是不透明因果版本，不是所有离线设备共用的自增整数。服务端 / 内核检查引用、文本唯一匹配与版本；没有匹配或匹配多处时返回冲突，不猜测目标。

批量操作先整体验证，再提交到同一文档副本，并携带 origin / actor；本地事务可原子撤销，不宣称跨设备所有同时动作天然具有全局事务隔离。几何、文字、附件等操作有不同的冲突语义。完整外部 DSL 编辑先导入比较，不用整包替换绕过上述行为。

## 必须经过的格式实验

1. 对正文中的引号、反斜线、LaTeX、Unicode、Markdown code fence 和超长文本做 round-trip。
2. 同一个内容块多处展示、删除展示、编辑内容与删除内容均有可预测结果。
3. 只保留 DSL / source / assets 后新建文档；保留 checkpoint 后恢复原同步身份，两种路径分别验证。
4. 外部 DSL 的过期编辑不覆盖正在输入的正文；非法 / 未来 schema 不毁坏文件。
5. Ink 的压力、笔画 ID、透明度 / 笔刷及擦除结果在 Mac 与 iPad 往返后仍可编辑。
6. Interactive 程序在不同 renderer 保持状态 / 计算 / 事件语义；预览、发布、个人状态与缺 capability 分别验证。
7. 可移植包校验缺文件、大小 / hash 不符、重复 ID、悬空引用、路径穿越、未知必需类型。

本轮提供 [示例包](notes-canvas-example/README.md) 供评审语义；不把文件检查当作以上 parser / 编辑器 / 跨端实验已经完成。

## 当前画布交互 IR 扩展（2026-10-20）

KDL 仍是提案；已运行的 draft-1 JSON 现包含 `shape` 块和可选 `board.connectors`。Shape 扩为 26 个语义枚举，含文字、`neutral | sage | sand | blue` 色调及可选 `shapeStyle`；Placement 增加可选 `group` / `locked`。完整字段与布局规则见 [选择与布局](canvas-selection-and-layout.md)。连接示例：

```json
{
  "id": "connection.example",
  "from": { "placement": "place.source", "side": "e" },
  "to": { "placement": "place.target", "side": "w" },
  "routing": "curve",
  "style": "dashed",
  "startArrow": false,
  "endArrow": true,
  "label": "关系"
}
```

端点使用摆放 ID，双方可引用同一摆放形成自环；删除摆放同步删除关联线，Undo 原子恢复。重命名、编辑正文或多个摆放共享内容不改变关系身份。绑定端点可选 `anchor: { "x": 0, "y": 0.25 }` 表示归一化相对轮廓位置（如矩形左边 1/4 处），两个坐标必须在 0–1，省略时使用旧的 `side` 关键点；几何层将 anchor 投影到当前形状轮廓，保持移动 / 缩放后的连接。端点也可使用互斥的自由 `point` 世界坐标，自由端点不得带 anchor；routing 支持 curve / elbow / rounded / straight，style 支持 solid / dashed / dotted，可选端点标记、颜色 / 透明度 / 粗细、折点 / 跳线、文字格式、锁定与层级，均严格校验。详见 [连线编辑协议](connector-editing.md)；无任意脚本或 CSS。旧文档可省略连接数组；复杂路径避障和原生连接 renderer 尚未实现。详见 [当前画布运行时](canvas-workspace-runtime.md)。
