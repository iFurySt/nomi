# TestFlight 家庭外部分发

## 目标

让没有 Apple Developer / App Store Connect 权限的家庭成员可以通过 TestFlight 安装 Nomi，同时确保 Apple Beta App Review 使用隔离的演示家庭，不能访问真实家庭健康资料。

## 范围

- 包含：公开隐私/支持页面、隔离审核账号的可重复运维入口、TestFlight 外部测试资料、外部测试组和 Beta App Review 提交。
- 不包含：App Store 正式发布、公开自助注册、真实健康资料迁移。

## 背景

- 相关文档：`docs/SECURITY.md`、`docs/IOS_TESTFLIGHT_RELEASE.md`、`docs/product-specs/family-private-beta.md`。
- 相关代码路径：`apps/server/internal/app/`、`infra/amoylab/`。
- 已知约束：生产已初始化真实家庭；审核账号不得通过家庭邀请加入该家庭；外部测试首次构建必须经过 Apple Beta App Review。

## 风险

- 风险：审核账号误入真实家庭并看到后续健康资料。
- 缓解方式：由仅能在运维环境执行的 server CLI 创建独立 household，不暴露公共创建家庭接口。
- 风险：审核凭据进入 git、日志或 shell history。
- 缓解方式：随机生成并只存入 git ignored 的本机 `.apple/`，提交给 Apple 前进行 action-time 确认。

## 里程碑

1. 补齐外测所需的公开说明和隔离审核账号能力。
2. 部署并验证独立审核家庭。
3. 配置外部测试组、审核信息并提交 Beta App Review。
4. 审核通过后邀请家庭成员并完成安装验证。

## 验证方式

- 命令：`go test -race ./...`、`go vet ./...`、`make ci`。
- 手工检查：隐私/支持 URL 可公开访问；真实家庭和审核家庭 household ID 不同。
- 观测检查：生产 health 正常；审核账号只能看到演示家庭；TestFlight build 状态进入审核/可测试。

## 进度记录

- [x] 确认真实家庭初始化成功，Build 5 已进入内部测试组。
- [x] 完成公开隐私/支持页面和隔离审核账号入口。
- [ ] 部署并创建隔离审核家庭。
- [ ] 配置外部测试并提交 Beta App Review。
- [ ] 审核通过并完成家庭成员安装验证。

## 决策记录

- 2026-08-23：不把 Apple 审核账号加入真实家庭；使用运维 CLI 创建独立审核 household，避免审核期间暴露家庭健康资料。
