## 2026-11-22 | 移动端原生账号与第三方登录

用户希望移动端固定连接官网，通过侧栏底部的账号图标进入原生登录、设置和退出，并为 Nomi 配置 Google OAuth，复用已有 Apple App。

- SwiftUI 将访客头像、密码表单、Apple 系统按钮、Google 系统认证窗口和个人设置接入文稿工作台。成功登录后复用原有钥匙串、设备会话和云库同步。
- Go 新增 migration 004，验证第三方签名、受众及短期一次性 nonce，将供应商的稳定用户标识关联到当前已认证账号。首次通过设置显式关联，保护原有私有文稿。
- 创建 Nomi 专用 Google iOS OAuth 客户端，测试用户受 Google 项目的 Audience 控制。Apple 端已接入原生授权，既有 App ID 待账号管理员启用 capability。
- 已校验配对备份并部署正式服务。隔离 Go 测试覆盖关联、重复使用及凭据校验。Duo 验证密码登录、设置、退出与文稿双向同步。通过 HTTPS 使用专用测试账号完成文稿包和附件往返。
- 主要入口为 `apps/ios/Sources/CloudPanel.swift`、`ProviderAuthorization.swift` 和 `apps/sync-server/internal/syncserver/native_identity.go`。参见 [Duo 验收截图](../../generated/verification/mobile-account/)。

个人设置增加原生版本菜单，读取安装包的版本与构建号。已连接云库时自动同步，设置页只在有待提交修改、冲突或需要选择云库时显示相应内容。Duo 对端测试覆盖保存后由自动调度提交。
