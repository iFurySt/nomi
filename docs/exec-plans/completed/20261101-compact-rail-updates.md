# 紧凑侧栏与更新入口

- [x] 56px 纯图标 rail、悬停提示和 28px 头像，保留移动端文字导航。
- [x] 使用 Sparkle SPUUserDriver 将发现 / 下载真实字节进度 / 解包 / 待重启 / 错误映射到共享状态；安装前保存屏障。
- [x] 侧栏下载图标、圆环、准备好后重启提示；Settings 复用状态，失败可重试，取消不安装。
- [x] 原生 driver 回调与 UI 隔离回归，浅深色截图，构建重启实际 App。

约束：不覆盖已发布 0.1.0 制品，不改真实文稿；更新下载和验证由 Sparkle 负责，renderer 不可提供 feed / 路径。开发环境不伪造可用更新，测试场景仅在隔离 fixture。参考官方 https://sparkle-project.org/documentation/custom-user-interfaces/ 与固定 2.10.1 headers。

验证：类型、264 单测、原生回调、Host 保存屏障、UI 隔离场景、生产构建与独立打包 Sparkle smoke 均通过。实际开发 App 已在最终构建后退出重启，Computer Use 确认 Canvas / 文稿正常、紧凑导航可见；用户已解锁，重启验收完成。
