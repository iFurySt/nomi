# .nomi 文稿文件包设计

状态：2026-10-31 设计基线。用户已确认并授权实施第一版；当前准确字段、打开行为和限制见 [.nomi v1 实现契约](nomi-package-format.md)。本文保留整体方向及后续原位编辑 / 原生协调等设计，不能将全部提案当作已实现。

## 结论与边界

推荐 `.nomi` 为有类型的目录（Document Package）：Finder 显示为一个文稿，工具通过普通文件读写其中的 DSL、正文与原件。日常保存不压缩，不把二进制编码进 JSON，不依赖数据库才能还原笔记。必要时 ZIP 仅作为网络 / 邮件传输封装，不赋予 `.nomi` 两种不同的物理含义。

它是文稿数据包，不是可执行应用，不沿用 `.app` 的可执行目录和签名语义。Apple 不要求文稿包采用 `Contents/`；Nomi 使用浅层结构，方便人工与 AI 查看。Finder 的单对象展示需要 App 注册类型，仅把目录改为 `.nomi` 后缀不能承诺在所有系统自动得到相同行为。

核心验收：复制一份包到全新用户环境，在没有原库、索引、缓存和网络时，仍能还原包内本篇内容、内置交互定义、原件及选择包含的子文稿。外部实时数据和跨包链接单独标识，不假装它们都已离线包含。

## 包结构建议

```text
文稿/
  学习计划.nomi/
    document.json                   # 格式 / 版本、稳定身份、内容顺序和资源声明
    text/
      b_intro.md                    # Markdown / LaTeX 原文
    interactive/
      b_temperature.nomi-ui.json    # 未求值的交互程序与默认参数
    ink/
      b_handwriting.ink.json        # 可编辑笔迹；未来实现
    assets/
      <sha256>.png                  # 包内附件原件
      <sha256>.pdf
    children/
      第一周.nomi/
        document.json
        text/...
        assets/...
    previews/                       # 可选、可丢弃，不参与正文正确性
```

最小空包只需要 `document.json`；目录按需创建。不照搬应用包的 `Info.plist`、`MacOS/`、`Frameworks/`。注册类型的信息放在 Nomi App 的 Info.plist，不强制每篇笔记增加一套系统配置。

第一版推荐基于现有 JSON 语义 IR 设计 package codec，使用公开 JSON Schema。正文按稳定 block ID 拆成 `.md`，交互块保留现有 IR；富文本中不能由支持的 Markdown 方言无损表达的类型必须有显式结构表示。结构与内容不得在 JSON 和 Markdown 中各保存一份主副本。旧 KDL 提案不作为迁移的前置条件，也不将 JSON 容器版本和 DSL 语义版本混为一谈。

以下只是新 codec 的字段示意，**不是现有 CanvasDocument 可直接导入的 JSON**：

```json
{
  "format": "nomi-package",
  "formatVersion": 1,
  "documentId": "doc_example",
  "title": "学习计划",
  "blocks": [
    { "id": "b_intro", "type": "markdown", "source": "text/b_intro.md" },
    { "id": "b_lab", "type": "interactive", "source": "interactive/b_lab.nomi-ui.json" }
  ],
  "assets": [],
  "childOrder": ["doc_week_one"]
}
```

`document.json` 是内容入口；块引用只含包内相对路径，身份不依赖标题和目录位置。资产声明保留 ID、媒体类型、原名、digest、长度；原件不可原地覆盖，替换图片产生新资产，按需回收无引用旧资产。`text/` 和交互源是可直接修改的文件，不要求作者每次维护一个总内容 hash 或手动递增 revision；运行时读取后计算内容指纹。

渲染、搜索、OCR、缩略图、选中项、camera、展开状态和进度不是正文的第二份真相源。索引和本机状态可以在库外缓存；包中的 `previews/` 删除后应能重建。个人学习答案与进度按用户隔离，不随共享教材默认复制。凭据、token、设备绝对路径不得进入包。

## 子文稿：推荐嵌套包，明确 Finder 的取舍

推荐父文稿的 `children/` 存放子包。每个子包自身也完整；复制父包带走整个子树，单独拿走子包也能打开。父子关系来自实际目录位置，`childOrder` 只表示同级顺序：遗漏的新子包追加；已消失的 ID 不被当作仍存在的文稿。普通 `assets/` 或 `text/` 目录不再被误识别成子文稿。

这保留物理层级，但改变 Finder 的浏览体验：**Finder 默认把父包当作单个文稿，不能同时像普通文件夹一样直接展开全部子页**。需要“显示包内容”后进入 `children/`；Nomi 内的树照常展开。App 可提供“在 Finder 显示文稿”和“打开子文稿目录”两个明确入口。

备选是包与同名普通目录并排，但父文稿不再是完整可搬走的单对象，改名 / 搬动需联动两项；不作为本次推荐。若用户更看重 Finder 普通树展开，应重新选择该取舍，不能声称两者默认兼得。

包路径和文稿 ID 分开：改名、同库移动保持 ID；文件夹名是系统显示名，文稿内 `title` 允许空值及比文件名更丰富的字符。App 改标题时同步合法化后的包名；外部仅改包名时通过前次观察到的路径 / 标题基线生成标题修改；AI 仅改 title 时同步包名。两边同时变化且不一致时提示冲突，不按扫描顺序覆盖。非法字符、重名后缀与迁移原标题必须保留可逆映射。该对账规则需要专门测试。

重复身份不是简单的“两个路径指向同一篇”：Finder 移动保留 ID；App 复制递归生成新 ID 并改写包内引用。Finder 复制产生相同 ID 时先显示为待处理副本，提供创建独立副本，不自动合并、更不更新错误的原稿。新环境仅打开一份包可保留身份；同步身份仍需独立恢复协议。

## AI 与外部编辑

AI 可以直接读取 `document.json`、查找具体 block，再编辑对应 `.md` 或 `.nomi-ui.json`。只改一段文字无需改整个库、打包解包或重新序列化其它笔记。给包增添一张图片时先写完整原件，再增加资产声明和内容引用。

宿主负责将外部变化转成文档修改：

1. 文件事件合并，前台重扫作为补偿；重新绑定被替换或移动的目录监听。事件并不等同一次完整提交。
2. 读取候选文件集，做读取前后指纹检查、schema / 引用 / 路径 / 大小校验；缺文件或半截 JSON 不替换当前可用文稿。
3. 无本地冲突时更新对应块，尽量保留光标 / 选区；外部修改产生明确的历史边界，不让旧 Undo 盲目覆盖已接收内容。
4. 比较“上次接受版本、本地草稿、磁盘候选”三者。首版可保守提示冲突并保留双方，之后才增加互不重叠块的合并；不采用最后写入者直接覆盖。
5. 版本过新或必需特性未知时只读 / 占位，并保留源码；不得保存时丢掉无法识别的字段和文件。

稳定时间窗口只能降低半写误读，**无法证明多个任意文件编辑是一次原子事务**。普通文本工具可直接修改并在形成合法稳定状态后生效；需要跨多个文件严格提交时，提供可选的 `nomi validate` / `nomi apply --base <fingerprint>` 工具，暂存、整体验证后以宿主事务发布。命令名为建议，不是已有工具。

App 自身保存以单文件临时写 / fsync / rename、预写新资产、版本检查及可恢复日志完成；不应每次输入重建整个包，更不能每次改子页就替换整棵父目录。跨包拖动和引用修改使用库级恢复事务；跨卷搬动复制验证后再完成，不能假设 rename 原子。系统文件协调不能替代对不合作外部写入者的冲突检测。

接受版本、待恢复事务及草稿备份由独立存储管理，避免把历史和临时文件当成当前 DSL；完整备份可包含这些运行资料，普通便携文稿复制不依赖它们。长期协作日志仍遵守既有 DSL 草案中“正文快照与同步身份分离”的原则。

## 画布、共享内容与独立性

当前一个 CanvasDocument 包含多篇 Note、共享 Block 和一个 Board，因此迁移**不能只把每篇标题改成 .nomi，或者简单按 Note 拆数组**。

- 一份 `.nomi` 可以承载一篇笔记及其画布视图，也可承载独立画布；内容和 Placement 继续分离。包内自有内容、布局和连线必须完整。
- 本库总画布成为独立文稿包，引用其它文稿使用稳定身份，不保存固定绝对路径。
- 块应有明确唯一所有者。现有多 Note 共享 Block 迁移时先识别共享关系，再将其他使用处表示为显式引用，保留同库联动；不能无提示复制成互不关联内容。
- 跨包引用不等于包内自有正文。为便携打开可以携带显式标记的最后快照；原件可达时显示实时引用，不可达时标明快照时间。脱离来源编辑快照产生独立副本，不伪装为回写原文。
- 导出 / 复制时可选择将引用物化为包内独立内容；递归链接不无限展开。画布导出需定义引用闭包和循环处理，保持内部连线 / 摆放引用正确。

首个 codec 必须覆盖现有所有块、附件说明、富文本语义、GenUI、形状、连接样式及手动路径，而不只覆盖纯 Markdown。手写是为未来保留的可编辑源约定，不因目录存在就宣称已支持。

## 平台接入

macOS 推荐注册自有 UTI（候选 `com.ifuryst.nomi.document`），关联 `.nomi` 并声明 package 类型，配置 `CFBundleDocumentTypes`。安装后验证 Finder 单对象图标、“显示包内容”、冷启动 / 热启动双击打开、最近文稿。不能仅依赖本机临时 Finder 属性或扩展名猜测。

现有 Electron 构建入口的 macOS 包生成在 `scripts/desktop-runtime.mjs`，文稿打开应在 `ready` 前监听 `open-file` 并排队，主进程校验包后再交给 renderer。打开库外包默认原位打开，不悄悄导入当前库；“加入文稿库”是显式操作。

Apple 的原生接口支持 `FileWrapper` / `UIDocument` 文件包。未来 iOS 可复用格式、另写 renderer；对用户可访问位置和文件服务商，需接入文件协调 / 权限和下载状态。Electron 的普通 Node fs 并不会自动获得 NSDocument 的协调行为，应评估小型原生桥接。

Windows / Android / Web 可复用包的逻辑结构与 DSL，但系统文件管理器不保证将目录显示成单文件。Android 需适配 provider / 目录权限，Web 需导入或支持的文件访问 API；跨端同步要设计版本、冲突与按资源传输。采用目录包本身不会自动得到 iCloud / Android 同步或 CRDT。

## 迁移和实施顺序

1. 冻结一个小范围 package codec 草案与正反例：读写、schema、正文原文、附件原件和子包，不先切换真实用户库。
2. 以现有文稿 / 画布 fixtures 做全量语义 round-trip，解决共享块所有权与跨包引用；索引删除后完全重建；独立包离开原库仍能打开。
3. 建立外部修改接收、冲突、恢复事务及可选 AI apply 工具；验证文件监听重绑、原位保存不会让 Finder 跟到旧备份目录。
4. 注册 Finder 文稿类型，接双击与库外打开；真实 Computer Use 验证父 / 子包、改名、复制、移动与显示包内容。iOS 同源样例读取单独验收。
5. 当前完整快照迁移到新根：flush + 完整备份，构建包，逐 Note / Block / Board 比较引用与正文、逐 Asset 比较摘要，成功后一次切换配置。保留旧库，按 scope 独立迁移，不建立两套可同时写入的真相源。

关键验收还包括：直接改 Markdown 后 App 更新；非法源修正后恢复；AI 与输入冲突；进程中断、多文件半提交；缺原件与未来版本；重名 / 空标题 / 非法文件名；子树复制 ID 重映射；跨包共享块与断链；笔记超过当前 100 篇限制前的增量扫描和性能评估。包数量不会自动解除现有内核上限。

## 参考依据

- [Apple：Document Packages](https://developer.apple.com/library/archive/documentation/CoreFoundation/Conceptual/CFBundles/DocumentPackages/DocumentPackages.html)：文件包为目录，内部组织自定，须注册文稿类型，可用普通文件 API 创建与读取。
- [Apple：Using FileWrappers as File Containers](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileWrappers/FileWrappers.html)：FileWrapper、用户可访问目录的文件协调，以及自有 UTI 注册。
- [Apple：UIDocument](https://developer.apple.com/documentation/uikit/uidocument)：文件包使用 FileWrapper 读写。
- [Electron：app / open-file](https://www.electronjs.org/docs/latest/api/app#event-open-file-macos)：冷启动事件需在 ready 之前监听。

资料验证了平台机制；本文件保留长期设计，实际验收与首版差异以实现契约为准。
