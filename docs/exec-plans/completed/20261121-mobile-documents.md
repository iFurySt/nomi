# Duo 本地文稿首版

在新 SwiftUI 客户端完成文稿的新建、浏览、修改、搜索和删除。以横向展开的目录 / 正文分栏为基线，窄屏目录按需覆盖。手机写入私有文稿目录，每篇使用 v1 note 包和稳定 Markdown block ID。账号、云同步和非文本块留给后续切片。

1. 创建独立模拟器工程和原子包保存，读取失败保留原包。
2. 实现自适应阅读和编辑，通过安全区及实际可用宽度切换布局。
3. 用 XCUI 操作并重启验证持久化，核对 Duo 内外屏实际截图和桌面解码。

用户追加手机文稿同步验收。接入现有 v1 网站登录与实体版本协议，在独立测试库验证手机写入、桌面读取修改、手机回读及冲突保护。云库与设备资料分开，明确复制本机文稿到已连接的云库。

## 验收完成

2026-11-22 在 iPhone Duo（iOS 27.1）上完成本机文稿操作、真实网页登录回跳以及与 Electron 客户端的双向同步验收，3 项 XCTest 全部通过。同步覆盖正文回写、未发送事务恢复、删除传播和同块冲突保留副本。桌面同步回归和仓库 CI 均通过。

[展开横屏](../../generated/verification/mobile-documents/duo-open.png) · [展开竖屏](../../generated/verification/mobile-documents/duo-portrait.png) · [合起外屏](../../generated/verification/mobile-documents/duo-folded.png)
