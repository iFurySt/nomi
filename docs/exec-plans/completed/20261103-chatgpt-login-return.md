# ChatGPT 登录反馈与返回桌面

## 目标
紧凑、可恢复的连接状态；回调浏览器页面可自动 / 手动返回 Nomi，不能将收到授权码误称为已完成连接。

## 实施
- [x] 未验证注册不显示虚假账号；等待、失败、重试、取消、成功状态独立。
- [x] 固定 HTML 回调页，nonce CSP / no-store / no-referrer，清除地址栏参数。
- [x] nomi://auth/complete 仅唤醒窗口；开发包独立 nomi-local，避免与安装版争用。
- [x] OAuth 合成测试与隔离 Electron 浅深色 / 窄屏截图。
- [x] 构建与实际桌面重启。
- [x] 真实授权成功，浏览器回调页与 App 已连接状态确认。

## 边界
保留 HTTP loopback + PKCE / state / nonce / JWT；App Link 不传 OAuth code、token 或 state。仅 macOS 发布包声明协议。另一个会话的内嵌画布修改保留，不在此任务内修改。
