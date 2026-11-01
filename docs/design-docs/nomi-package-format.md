# .nomi 文件包 v1 实现契约

状态：2026-10-31，桌面第一版。设计动机和后续演进见 [文件包设计](nomi-document-package.md)；本页是当前实现的准确字段和边界。底层内容语义仍为 `nomi-document-ir/draft-1`，容器 `version: 1` 与内容 schema 分开版本化。

## 目录组织

```text
Nomi/
  文稿/
    学习计划.nomi/                 # Finder 中为单个文稿，实际为目录
      document.json               # 版本、身份、顺序、源文件 / 原件 / 共享引用
      text/
        text.intro.md             # Markdown / LaTeX 原文，直接编辑即生效
      interactive/
        interactive.lab.nomi-ui.json
      assets/
        <sha256>.pdf              # 原始二进制，不做 Base64
      children/
        第一周.nomi/              # 同样完整的文稿包
          document.json
          text/...
          assets/...
    画布.nomi/                     # 本工作区画布；含显式引用的便携快照
      document.json
      text/...
      interactive/...
      assets/...
  workspaces/<scope>.nomi.json      # 已接受版本 / 恢复投影，可从包重建
  assets/<sha256>                   # 宿主原件缓存、撤销和旧版本所需原件
  .nomi-history/                   # 旧库、暂存提交、备份及被删除包
```

未使用的目录不必创建。`ink/` 与 `previews/` 是设计预留，当前 renderer 没有笔迹支持，也未生成预览缓存。未知普通文件留在包内；不自动把任意目录识别成文稿，仅扫描根目录和 `children/` 内的 `.nomi` 包。系统文件管理器的排序不改变文稿顺序。

本机默认 scope 位于 `文稿/`；其他 profile 继续使用隔离的 `文稿-<sha256>/`。库根不是包。打开文件包不执行任何代码，GenUI 仍经过现有严格解释器。

## document.json

字段由 `packages/host/src/nomi-package.ts` 校验，未支持的字段 / 主版本拒绝写回，不静默丢弃。示例见 [可打开的样例](nomi-package-example/README.md)。

| 字段 | 含义 |
| --- | --- |
| `format` / `version` | 固定 `nomi-package` / `1` |
| `kind` | `note` 或 `board` |
| `packageId` | note 包为根 Note ID；board 包为工作区 Document ID |
| `fileName` | 上次发布的包名，用于识别 Finder 重命名 |
| `publishedTitle` | 上次发布的标题，用于辨别内部标题 / 包名的并发修改 |
| `references` | `{ blockId: ownerPackageId }`：该块是引用快照，所有者包持有实时内容 |
| `childOrder` | 当前包子文稿 ID 顺序；board 中表示库根文稿顺序 |
| `noteOrder` | board 的全局 Note 数组顺序，保持旧工作区往返；note 包为空数组 |
| `assetPaths` | `{ assetId: "assets/<hash>.<ext>" }`，声明到原件的相对路径 |
| `document` | 内容 IR；Markdown / Interactive 的源表示按下文外置，其余语义保留 |

`document` 与现有 CanvasDocument 字段相同：`schema,id,title,revision,notes,blocks,assets,board`。note 包 `notes` 只有本篇，移除 `parentId`，真实 `children/` 位置决定父子；其 `document.id` 保留工作区身份，与 note / block 等对象 ID 不重复。note 包 title 和根 Note.title 由 App 同步；AI 可以修改其中之一，若两者同时变化且不一致则拒绝。包名与内部标题同时变化时也要求先统一，不按扫描顺序覆盖。

Markdown 存储块：

```json
{ "id": "text.intro", "type": "markdown", "source": "text/text.intro.md" }
```

`source` 在文件包中是 UTF-8 原文路径，在解码后的内存 IR 中才是正文。交互存储块：

```json
{ "id": "interactive.lab", "type": "interactive", "source": "interactive/interactive.lab.nomi-ui.json" }
```

读取时还原为 `program`。图片 / 文件 / 形状、Asset metadata、Placement、Connector 等继续现有 IR 定义，保留图片说明、连线类型 / 端点 / 手动路径及样式。路径拒绝绝对路径、空片段、`..` 和 symlink 逃逸；原件校验字节数与 SHA-256。

## AI 直接编辑规则

1. 读取 `document.json`，检查版本和 `references`。对引用块，应查找 `ownerPackageId` 对应包，在所有者处编辑；引用快照不是第二份正文来源。
2. 修改对应 `text/<blockId>.md`，保留 block ID。LaTeX 直接写在 Markdown 中；不要把源码替换成渲染 HTML。
3. 修改交互时编辑对应 JSON 程序，保留稳定节点 ID，遵守现有 IR 类型 / 能力限制。不要放任意 JS 到声明式程序中。
4. 添加资源先写完整原件，再添加 Asset metadata、assetPaths 和内容引用。替换已有原件应新建 Asset ID，不能改原件摘要以覆盖旧身份。
5. 增加块需要同时写好源文件并更新 `document.blocks` 和 `document.notes[0].blocks` 的顺序。新增文稿需要完整合法 `.nomi/document.json`；单纯创建空目录不会自动生成笔记。
6. 不修改 `packageId`、`fileName`、`publishedTitle` 或伪造 `references` 来做重命名 / 复制。改标题可改 `document.title`；层级通过搬动包到目标 `children/` 完成；复制推荐 File → 打开文稿包后选择导入独立副本。
7. 无需手动递增 revision 或维护总内容 hash。宿主比较内容、校验并接收修改，计算新本地版本。未知版本 / 非法源 / 缺原件保留上一个可用画面和现有文件，修正后继续读取。

当前在前台每 1.5 秒及窗口聚焦检查包内容；没有本地待保存修改才接受外部变化。读取期间再次检查文本 / 结构文件，降低半写误读。仍不保证任意外部工具的多个文件写入是原子事务；跨文件编辑应先资源后引用。可选 AI `validate/apply` CLI 还未实现。

冲突时保留草稿，使用现有“读取磁盘版本（保留当前草稿）”入口。外部变化接受后清空旧 Undo；第一版未实现文本三方合并或精确光标映射。

## 共享、画布与可移植性

每个 Block 有唯一内容所有者，通常为引用它的第一篇 Note；既有所有者仍使用该块时保持不变。没有 Note 使用的块由画布包拥有。其它包在 `references` 中声明来源，并携带可独立解码的内容和原件快照。

库内读取优先使用存在的所有者；所有者缺失时使用便携快照。接受外部修改或 App 保存时，同步更新相关快照。引用块的备用源文件不是 AI 的编辑入口。跨包联动不依赖绝对路径。用户在已脱离原库的包上选择导入，创建独立 ID 和内容，不回写原库。

当前全局画布的布局 / 连线以 `画布.nomi` 为准。note 包携带仅涉及本篇内容的画布快照，用于独立打开 / 导入，不作为本库总画布布局的第二份权威来源。独立画布包携带完整 Notes / Blocks / Assets 的快照，即使原库不存在仍能导入。这有存储重复的代价；第一版优先保证可移植性，尚未做包间原件去重或 GC。

## 保存与恢复

正文保存只写内容变化的文件；同一包 inode 和未变化的原件保持不变。结构移动通过 rename，保留包内未管理文件。结构事务暂存所有已识别包再按层级放回，避免父子同时移动产生路径冲突；被删除的包保留在事务 hold 目录。每步有恢复游标，重复执行校验新旧内容摘要；若提交期间发现外部写入则停止，保留恢复资料。

快照是最后接受版本、撤销原件索引和恢复投影，不应手动编辑。删除单个 workspace 投影文件后可从包重建；损坏投影或恢复日志时保守报错，未实现一键修复界面。旧版快照和普通文稿目录首次读取时迁移为包，完整旧树保存在 `.nomi-history/<transaction>/legacy-tree`，旧 DSL 为 `before.json`；旧树中的额外普通文件保留在备份，第一版不将它们自动导入正文资产。

当前实现无跨进程强互斥 / 原生 NSFileCoordinator，文件事件尚未替代前台扫描；iCloud 与多个外部写入者的强一致协作未认证。恢复日志和备份未自动清理。

## macOS 与打开行为

App 注册 `com.ifuryst.nomi.document`、`.nomi`、`com.apple.package`，Finder 显示为单个文稿，右键可显示包内容。Nomi 文稿菜单新增“在 Finder 中显示”和“打开子文稿目录”。父子层级在 Nomi 展开，在 Finder 需进入包内容。

File → 打开文稿包 / ⌘O、Finder 双击和 Dock 打开走同一流程：库内包定位现有文稿；库外包明确询问“导入独立副本”，保留来源，递归重建 Note / Block / Asset / Placement / Connector ID。首版不支持库外包原位编辑；这是原位编辑设计完成前的明确边界，不悄悄导入。

## 验证入口

- `pnpm test --maxWorkers=2`：包含 `nomi-package.test.ts` 的真实文件往返、AI 修改、独立原件、共享引用、移动 / Undo、迁移 / 恢复与恶意路径测试。
- `pnpm smoke:document-directory`：真实 Electron / preload / host / React，旧 IndexedDB 迁移、原件、包内正文修改出现在编辑器、子包、冲突备份、目录更换和布局。
- 正式 App Computer Use：注册包外观、显示包内容、改名 / 打开、实际文字修改和退出重启，截图单独记录。
