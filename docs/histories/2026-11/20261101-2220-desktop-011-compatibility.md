## 2026-11-01 | Task: 文稿前向兼容与 Desktop 0.1.1

### Execution Context

- Agent: Codex `/root`，本机桌面工作区。

### User Query

> 0.1.0 打开时报「包含未支持的字段」，应兼容未知字段；补充提交推送并发布 0.1.1，用于测试自动升级。

### Changes

- 将持久化文档的封闭字段校验改为已知字段校验，未知附加 JSON 数据不解释但保留。原有版本、类型、引用、JSON 大小 / 深度 / 安全键约束继续生效；交互 IR 仍严格校验。
- `.nomi` manifest 与逐篇 document / board 的附加字段在读取、重组和保存时保留；Markdown / 交互声明中的扩展也可往返。
- 增加读入→修改→保存→重开、逐篇元数据隔离、危险附加值和已知字段错误回归；更新原先将普通扩展视为错误的断言。
- 根包和桌面版本升至 0.1.1，同步格式契约、发布记录及发布计划。本版本同时包含已完成的紧凑导航、原生更新状态 UI、文稿图标与空白处新建菜单，详见各自 history。

### Design intent

同一 schema 的可选元数据演进不应让整库无法打开；直接 strip 未知字段又会在保存时丢失信息。采用容忍读取、原样保留、严格必需语义的边界。0.1.0 本身需要升级，不能追溯修改已分发的二进制。

### Validation

38 文件 / 285 单测、类型检查、生产构建和 IME 回归通过。原生更新 driver / host 回归通过。公开发布及真实重启结果追加到发布计划和 Desktop 发布文档；保留安装的 0.1.0 供用户亲自测试升级。

### Main files

- `packages/core/src/canvas/document.ts`
- `packages/core/src/canvas/compatibility.test.ts`
- `packages/host/src/nomi-package.ts`
- `packages/host/src/nomi-package.test.ts`
- `docs/design-docs/nomi-package-format.md`
