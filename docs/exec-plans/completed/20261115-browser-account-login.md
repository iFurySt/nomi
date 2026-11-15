# 网站登录与桌面回跳

用户修正：删除设置里的 Account；左下角登录在官网完成，以 App Link 回桌面。Base URL 留空使用 https://nomi.ifuryst.com，API /api 分流。

实现边界：网站短期登录请求 + PKCE S256，密码仅提交网站；App Link 仅唤醒，无 token / 密码。host 用内存 verifier 领取单次设备会话，取消 / 超时 / 重启不得接纳旧请求。Go 持久化短期请求，表单 CSRF / CSP / no-store、失败限流、一次性交换；不扩展为完整 OAuth2 provider。登录后同步与设备 / 冲突 / 历史保留，从左下角账户浮层访问，不放设置分类。旧 /api 地址兼容。

- [x] 服务端短期登录请求、网站登录页与安全测试。
- [x] 桌面 host 发起 / 取消 / 领取，App Link 唤醒和 API URL 归一化。
- [x] 左下角网页登录 / 账号浮层，删除 Account 设置。
- [x] 隔离端到端 / 视觉、文档、开发版重启。
- [x] 官方服务部署登录页和端点，合成账号公网验证。

验证：真实 PG 过期 / 错 verifier / CSRF / 重放 / 并发交换；真实页面密码提交与桌面 PKCE 领取、自动同步、取消和已有回归。只使用合成账号 / 资料；保留用户真实未绑定状态。

验收完成：24 项专项单测；Go PG race；隔离浏览器 + 三套 Electron 的 10 类同步回归（run-Qzu5Jk）；原件与 10 张业务表备份恢复（run-goWMfw）；类型、构建、基础 CI。视觉证据保存于 generated/verification/20261115-browser-*.png。官方登录服务已上线，合成账号公网验证并撤销会话。实际开发版已重启，不修改真实未绑定账号、不上传真实文稿。部署源码快照 SHA 与回退记录在 DEPLOYMENT；未发布 DMG。
