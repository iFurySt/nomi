# 本地文稿目录

本文记录原先的快照 + 物理目录实现，作为迁移来源保留。2026-10-31 已升级为 `.nomi` 文稿文件包：当前行为、目录、外部编辑和边界见 [.nomi v1 实现契约](nomi-package-format.md)，长期设计见 [文件包设计](nomi-document-package.md)。下面内容为历史基线，不代表新版正文来源。

## 用户行为

Settings 的 General 在 Appearance 上方，默认进入 General。文稿保存目录默认取系统 Documents 下的 Nomi；点击路径在 Finder / 系统文件管理器打开，「更改」使用原生目录选择器。路径来自真实配置，长路径有完整提示，窄窗口纵向排列。

用户明确选择 **Finder 文件夹层级直接对应左侧文稿树**。本机默认工作区的 `文稿/` 下，每一篇文稿都是同名目录，子文稿实际放在父目录内。App 新建、改标题、拖动、删除和撤销都会更新目录；Finder 新建目录、重命名、移动、删除会读回。叶子文稿也采用目录，可随时添加子页。

目录更换先 flush，选定后再 flush；复制受管理资料并校验，最后原子切换配置。已挂载仓库随后写新位置，保留当前撤销历史。目标必须为空（忽略 `.DS_Store`），禁止选当前目录的父 / 子路径；取消不变更。旧库保留副本；当前不支持合并或打开另一个已有库。

## 目录与 DSL

```text
Nomi/
  .nomi-library.json
  文稿/
    学习计划/
      .nomi-note.json
      第一周/
        .nomi-note.json
  文稿-<scope-sha256>/                    # 其他本机 profile / document
  workspaces/<scope-sha256>.nomi.json     # 完整正文、块、画布 DSL
  assets/<sha256>                        # 附件原始字节
  .nomi-history/                         # 结构事务、旧目录与草稿恢复资料
```

scope 是 `[profile, documentId]` 摘要。默认 `local-device/document.home` 对应 `文稿/`，其他 scope 使用隔离的树目录。

`.nomi-note.json` 保存 version、稳定 note ID、原始标题、创建时文件夹名和顺序。**实际父目录决定 parentId**，外部改名后实际目录名决定标题；App 内不合法文件名字符被替换，重复 / 大小写相同标题加后缀，元数据保留原始标题，避免把合法文稿标题强制变成文件名。文件系统没有稳定的自定义顺序，App 的同级排序保存为 metadata order；Finder 的显示排序不等同文稿排序。

正文、共享 Block、画布引用和附件关系仍以完整 CanvasDocument DSL 保存于工作区快照；目录负责结构，不把富文本和交互内容转换成有损 Markdown。`.nomi-note.json` 是身份文件，不是独立的完整文稿包；当前不能通过跨库搬走一个文件夹携带正文。普通文件保留，但不会自动导入成附件；普通非隐藏子目录会被识别成子文稿。新文件夹没有身份文件时分配稳定 ID，并生成可编辑的空 Markdown 块。直接复制含身份文件的目录会报重复 ID 错误，不把两篇文稿错误地绑定在一起。

## 原子保存与恢复

原件按 SHA-256 保存；校验长度、摘要、MIME 与不可变原件约束。普通正文保存使用临时文件、fsync 和 rename 原子提交快照。保存检查基准 revision，串行队列覆盖读取、保存与换目录。

结构改变时先准备新树，按稳定 ID 保留已有目录中的普通文件，再比较原树指纹。记录恢复日志后，将旧树移入 `.nomi-history/<transaction>/previous`，发布新树并提交快照。事务保留 `before.json`（完整旧 DSL）和 `snapshot.json`；中断后下次读取先完成恢复日志，不把半完成树当成空文稿。Finder 引起的结构更新也先留旧快照。删除与 Undo 可能留下可恢复原件和旧目录，当前不做 GC 或自动清理恢复资料。

受管理目录和读取文件不跟随 symlink；递归复制拒绝链接与特殊文件；目录数量 / 深度及 DSL 上限被校验。损坏身份、重复 ID、符号链接、路径冲突会报错并保留现状，不静默丢页。

## 外部刷新与冲突

桌面在前台每 1.5 秒检查一次，窗口获得焦点时立即检查。没有待保存编辑时，外部结构变化直接装入 React 会话，保留现有正文；清空旧撤销栈，防止撤销把已经接受的外部目录变动覆盖回去。

存在待保存编辑时不自动替换内存；保存发现外部 revision / 结构改变会失败，保留当前编辑与附件。界面提供「读取磁盘版本（保留当前草稿）」：先把完整当前文稿和新附件备份，再读取磁盘版本；期间继续输入则不替换。草稿保存在 `.nomi-history/draft-*.nomi.json`，当前没有恢复资料浏览器，恢复需读取 DSL。此实现保守拒绝并发冲突，不做自动文本合并。外部直接修改工作区 DSL 必须维护 revision / schema；目前主要承诺目录结构联动。

## 迁移、权限和边界

原 IndexedDB 按 profile 首次读取迁移并保留；已有磁盘快照首次读时补建文稿目录，正文和 revision 不变。磁盘有快照即优先使用，错误不回退为示例文稿。浏览器继续 IndexedDB，无 filesystem 能力。

主进程只向可信主 frame 暴露 status / choose / reveal / load / save / asset / backup；renderer 不接收任意文件路径权限。偏好存于 Electron userData 的 `document-directory.json`。已配置目录丢失会报错，不创建空替代库。学习参数、camera、侧栏宽度仍为设备偏好，不随文稿目录移动。没有云同步、iOS 或家庭服务接入。

## 验证

- `document-store.test.ts`：真实临时目录、原件、revision、迁移 / 切换、配置回滚、损坏和 symlink。
- `note-directory-tree.test.ts`：App 改名 / 移动 / 撤销、Finder 改名 / 移动 / 创建 / 删除、旧快照迁移、重复标题、重复身份、普通文件保留、草稿备份、内部删除前完整 DSL 与中断恢复。
- `pnpm smoke:document-directory`：真实 Electron preload / IPC / host + React App，旧库迁移、编辑、附件、General、目录切换 / 取消、刷新、主题 / 窄屏；新增实际 filesystem 改变后侧栏层级、新文件夹可编辑、并发冲突备份和磁盘重读。
- 正式 App 使用 Computer Use 检查已有内容、Finder 层级、改名读回及重启。自动 smoke 只用临时目录；原生 picker 返回值在自动化中合成，另以 Computer Use 验证真实 picker。
