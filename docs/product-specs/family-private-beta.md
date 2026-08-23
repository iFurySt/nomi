# Nomi 家庭健康资料 Private Beta

## 产品目标

Nomi 第一版面向一个受信任家庭，把已经在文件系统知识库中验证过的健康资料整理方式包装成 mobile-first App。家庭成员可以登录、选择资料归属、上传图片/PDF/文本等原始材料，并围绕个人或家庭长期上下文继续对话。

核心交付不是单张图片识别，而是完整闭环：

1. 保存原始来源。
2. 结合目标成员已有上下文归档和抽取。
3. 说明新材料代表什么、相较历史改变了什么、当前可得出的结论与仍待确认的问题。
4. 所有结论都能追溯到家庭工作区中的来源文件。

## 用户与资料边界

- `User` 是可登录 Nomi 的账号。
- `Household` 是数据与权限隔离边界。
- `Person` 是健康资料主体，可以对应一个登录账号，也可以是没有账号的孩子或长辈。
- `Membership` 表示账号在家庭中的角色；private beta 只区分 `owner` 与 `member`，两者默认都可查看家庭内全部资料。
- 每个资产、任务、对话都必须带 `household_id`；个人资料还必须带 `person_id`。
- 家庭共享资料与跨人对话允许 `person_id` 为空。

## 第一版范围

### Mobile

- 邮箱和密码注册/登录。
- 使用部署方提供的邀请码创建第一个家庭。
- 家庭 owner 可以创建一次性家庭邀请码，其他成员用邀请码加入。
- 查看和切换家庭成员。
- 创建、编辑健康资料主体。
- 上传图片、PDF 和文本文件。
- 查看异步处理状态和分析结果。
- 创建个人或家庭对话，并连续发送消息。
- 查看回答、来源引用与失败状态。
- 退出登录。

### Server

- `/v1` 业务接口默认全部要求 Bearer session。
- 唯一的匿名用户入口是注册与登录；`/health`、SeedX daemon 和短期签名资产 URL 使用各自独立的机器凭据。
- Postgres 保存账号、家庭、成员、资产 metadata、异步任务、对话、消息和 App 所需 projection。
- FS provider 保存原始资产与每个家庭独立的 Agent workspace。
- SeedX daemon 驱动 Codex 在家庭 workspace 中执行 ingest/chat job。
- job 必须可恢复：状态存在 Postgres，server 重启后可以重新领取 queued/processing 超时任务。
- 所有查询和写入都在 Store 层显式带 `household_id`，不允许只按资源 ID 访问。

### Agent workspace

每个家庭使用独立目录：

```text
workspaces/<household-id>/
  AGENTS.md
  docs/
  raw-data/
    _incoming/
    people/<person-id>/
    family/
  ai-vault/
    people/<person-id>/
    family/
  .nomi/
    jobs/
```

workspace 是 Agent 长期上下文和可审计资料层；Postgres 是 App 查询、状态和权限层。两者都不能单独替代另一层。

## 非目标

- 暂不维护 macOS 功能兼容。
- 暂不做饮食专用识别、营养 dashboard、趋势图或 Apple Watch。
- 暂不做公共多租户自助开通、计费或 App Store 正式发布。
- 暂不导入 `nomi-codex` 中的真实资料。
- 不把 Apple 审核账号加入真实家庭；外测审核使用运维侧创建的隔离演示家庭。

## AI 与健康边界

- 允许抽取报告中的明确文字和数值、整理诊断/用药史、比较用户提供的历史材料、生成就医前待确认问题。
- 必须区分来源事实、Agent 推断与仍需确认的信息。
- 不替代医生做诊断、处方、剂量调整或急症处置。
- 回答必须给出家庭 workspace 中的来源路径；没有资料支持时要明确说明。

## 验收标准

- 两个不同账号可以加入同一家庭并看到同一组 `Person`，未加入家庭的账号无法读取任何家庭资源。
- 未携带有效 Bearer token 的 `/v1` 请求统一返回 `401`，新增路由默认也受保护。
- 用户可以从 iOS 模拟器上传文件，server 返回 queued job，SeedX/Codex 完成后 App 显示结构化结果与来源。
- 用户可以围绕某个 `Person` 建立 thread，发送问题，Codex 读取该家庭 workspace 后生成带引用回答。
- 原始文件由 FS provider 保存；业务层只依赖 storage provider 接口。
- server 能部署到 amoylab，真实 Codex 使用服务端受控登录态运行。
