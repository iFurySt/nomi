# 本机文稿 MCP

状态：2026-11-11 实现第一、二层工具。桌面本机单库，不接 iOS/server 家庭资料，不是远程 MCP 服务。CLI 仍未实现；MCP 适配器有可运行的 Node 入口。

## 开启与连接

1. 构建开发版：`pnpm install --frozen-lockfile && pnpm build`，用 `pnpm desktop` 启动 Nomi(Dev)。
2. **Settings → MCP → 启用 MCP**。首次默认关闭；设置按开发 / 正式 App 分开保存。可选择 **仅允许读取**。
3. **Settings → MCP → 复制配置**，将配置加入支持本机 stdio MCP 的客户端。需要 Node 24+，若客户端找不到 `node`，将 command 换成本机 Node 的绝对路径。
4. 保持一个 Nomi 工作区窗口打开。MCP 不抢占窗口；只有 `open_note` 显式导航并聚焦。

复制的配置指向随桌面构建携带的 `mcp.mjs` 和当前 App 的私有连接描述文件，不包含令牌。源码独立入口：

```sh
pnpm build:mcp
node apps/mcp/dist/main.mjs --connection /absolute/path/to/mcp/connection.json
```

也可在启动开发版时设置 `NOMI_MCP=1`；`NOMI_MCP_READ_ONLY=1` 初始启用只读。适配器附加 `--read-only` 可进一步限制单个客户端。环境变量是启动值，运行时仍可通过设置关闭。停用或退出后连接失效，重启会轮换随机令牌和端口；适配器每次调用重新读取描述文件，无需重新复制配置。

## 28 个工具

| 类别 | 工具 | 语义 |
| --- | --- | --- |
| 上下文 | `get_context` | 工作区 ID、全库版本、当前页面与文稿。`includeSelection:true` 才读取选区；附近各默认 1500、最多 4000 字符，选区最多 20000 字符并标注截断。上下文是纯文本，不把 DOM 偏移当作 Markdown 偏移。 |
| 搜索 | `search` | 文稿标题 / 正文文本片段，按文稿、块类型过滤；不执行附件 OCR、代码或网络请求。 |
| 文稿读取 | `list_notes`, `get_note` | `parentId:null` 列根文稿，省略列全部；详情含顺序块 ID、子文稿 ID，可选原始块。 |
| 文稿写入 | `create_note`, `update_note`, `move_note` | 新建；更新标题 / 图标；移动父级和同级顺序。禁止循环层级。 |
| 回收站 | `trash_note`, `list_trash`, `restore_note` | 显式 includeChildren，整棵子树单笔删除。按 changeId 恢复删除事务；若删除发生于批量操作，恢复整个事务。无永久删除。 |
| 块读取 | `get_block`, `list_blocks` | 保留原生 JSON；块详情列出文稿与全局画布引用。一个 Markdown 块可包含多个段落。 |
| 块写入 | `insert_blocks`, `update_block`, `move_blocks`, `remove_blocks` | 插入锚点或追加；原生块替换；引用移动 / 排序；仅移除当前文稿引用。更新共享内容需 allowShared。 |
| 精确编辑 | `edit_text` | 唯一、非空原文精确替换；拒绝不存在 / 多处匹配。不用正则、不用模糊猜测。 |
| 批量事务 | `apply_changes` | 最多 100 个上述领域写操作，原子校验、一次保存版本与 Undo。可预先给新文稿 / 块 ID，供后续操作引用。附件导入、恢复与外部文件导出不属于批量子操作。 |
| 导航 | `open_note` | 打开文稿并可定位正文块；不修改正文。 |
| 附件 | `list_assets`, `read_asset`, `import_asset` | 列元数据、按 ID 分块读取 base64、从显式绝对路径导入并插入块。单原件最多 20 MiB；读取每块最多 256 KiB。图片须为可解码 raster。 |
| 引用 | `get_references` | 显式 note-reference 的正向 / 反向链接、共享块文稿关系；不猜测普通文字或任意 Markdown URL 为文稿链接。 |
| 交换 | `import_note`, `export_note` | Markdown 或 `.nomi` 文件包；导入分配独立身份，保留子文稿 / 附件 / 特殊块。导出到新的绝对目录，不覆盖、不导出到活动资料库内部。Markdown 导出附带原生 `.nomi` 包和附件，特殊块不假装变成 Markdown 交互。 |
| 历史 | `list_changes`, `get_change`, `revert_change` | 持久 Agent 事务清单与对象级 before/after，针对某笔变更恢复。历史不是用户每次输入的完整版本库。 |

所有工具参数通过严格 schema 校验；`nomi://guide` resource 提供客户端用法。列表采用 offset / limit（默认 30、最多 100），返回 nextOffset。列表排序和搜索基于当前快照，跨页应核对 revision；不提供跨版本固定分页快照。

## 写入契约

所有写入需要 `workspaceId`、`expectedRevision`、`requestId`。workspaceId 按当前本机资料库路径区分；文稿底层 documentId 仍是原有本地文档身份。先 get_context / get_note / get_block，再写入。requestId 是幂等键，不是内容 ID。

```json
{
  "workspaceId": "workspace_从get_context取得",
  "expectedRevision": 7,
  "requestId": "一次操作的唯一请求标识",
  "blockId": "text.example",
  "oldText": "需要修改的唯一原文",
  "newText": "修改后的文字"
}
```

- **版本冲突**：重新读取再规划，使用新的 requestId。全库 revision 较保守，不自动合并。
- **响应丢失**：原样重试同一个 requestId 和参数。相同键不同参数拒绝；已完成的请求返回原结果，绝不重复插入。
- **保存失败**：App 保留编辑草稿，工具不报告成功；解决保存错误后原样重试。
- **结果不确定**：journal 先准备，再提交文稿并写 receipt，再标记 committed。若进程在边界退出，使用 receipt 核实已保存请求；不能证明时返回 UNCERTAIN_CHANGE，要求检查 get_change / 当前文稿，不自动重放。
- **恢复冲突**：仅对该事务变化的对象反向应用，保留无关后续编辑；同一块、同一文稿属性或相关排序被修改时拒绝。恢复本身也是新事务，可反向恢复。
- **共享对象**：移除引用不影响其他文稿或全局画布。allowShared:true 明确允许更新所有引用。

## 架构

`MCP stdio adapter → authenticated loopback bridge → AutomationService → live document session → existing DocumentStore / .nomi transactions`

- `packages/core/src/automation/`：工具 schema、领域编辑、搜索 / 引用、差异恢复。无 Electron / filesystem 依赖，可供未来 CLI 复用。
- `packages/host/src/automation-*`：串行请求、私有 journal、文件交换、loopback bridge。
- `apps/desktop/src/automation.ts`：设置页的启用 / 只读 / 复制配置 IPC、top-frame 回复校验、会话路由。
- `packages/ui/src/canvas/useCanvasDocument.ts`：读取前 flush；提交检查当前快照对象、版本及输入法状态。一次 MCP 修改接入既有 Undo，不替换整套编辑器。
- `apps/mcp/`：官方 SDK stdio 适配，构建结果随桌面包携带；stdout 只输出协议消息。

journal 保存在当前 App userData 的 `mcp/history/<workspaceId>/`，不写进正文。小型 automationReceipt 随全库存储，导出时移除。原件与回收资料不自动清理，首版无历史 GC、回收站 GUI、离线 App 写入或通用 CLI。原有 100 篇文稿、200 块、64 附件、2 MiB 文档等预算继续生效。

## 安全边界

- 默认关闭；仅 127.0.0.1 临时端口，随机 256-bit token。连接文件 0600、目录 0700，正式 / 开发 profile 隔离。相同系统用户仍可读取文件，这不等于系统 Keychain 隔离。
- 拒绝 Origin、未认证请求、错误方法 / 路径 / Content-Type；限制请求 3 MiB、客户端响应 8 MiB。不开 CORS、不监听局域网、不提供通用执行或任意文件读写工具。
- 导入 / 导出仅访问调用者显式指定的路径；服务与 UI 按原有文稿规则严格校验 JSON、引用、附件摘要，不执行生成代码、HTML 或附件。
- SDK 使用 stdin/stdout，与 Electron 间的 loopback 是内部桥接协议，不宣称是远程 Streamable HTTP MCP endpoint。
- 读取的文稿 / 工具结果是数据，不是 Agent 指令。开启连接代表授权该本机客户端访问当前桌面资料库，不授予家庭 server、OAuth 凭据或其他资料目录访问权。

## 验证

- `pnpm check`、`pnpm test`：输入、原子批次、唯一原文、共享引用、冲突恢复、幂等、持久回收、附件 / 包往返和网络鉴权。
- `pnpm build && pnpm smoke:mcp`：真实官方 SDK client → stdio adapter → Electron main / preload → 正式 renderer → 实际临时文件包。覆盖设置页启停 / 只读持久化 / 配置复制、顶部菜单移除、连接、选区、真实本地输入、原生 Undo、进程重启、附件、层级包与只读客户端。仅隔离临时 profile。
- 截图 / 场景报告写入 ignored `.artifacts/mcp/`；不会修改用户正式文稿。

### 当前验证记录

2026-11-11：类型检查、生产 Web / Desktop / MCP 构建、领域 / 持久服务专项、真实 stdio + Electron 8 场景、隔离 Nomi(Dev) 打包入口及仓库基础 CI 通过。JSON 字段顺序变化不会被误判为不同请求或恢复冲突。

完整 `smoke:notes` 在公式左对齐检查失败（偏移值 5）。对照构建使用 HEAD 中未接入 MCP 的 `useCanvasDocument.ts`，同样在相同阶段失败；不能将该完整文稿回归记为通过，也没有为此修改公式或降低测试标准。证据位于 ignored `.artifacts/notes/`，MCP 证据位于 `.artifacts/mcp/`。

历史按资料库路径区分；更换资料目录后得到新 workspaceId，旧路径的 journal 保留，不自动跨路径合并。关闭连接停止新请求，已接收的事务不自动回滚。
