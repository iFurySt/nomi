# General 与本地文稿目录

## 目标与范围

Settings 在 Appearance 前提供 General；默认文稿目录为系统 Documents 下的 Nomi，支持系统目录选择器更换与打开目录。桌面真实落盘，浏览器继续 IndexedDB；文稿与画布共享语义文档，附件随行，不做有损 Markdown 转换。

## 约束与风险

- 当前存在上一轮未提交的文稿树改动，保留并兼容。
- 已有 IndexedDB 按 profile / document 首次读取迁移，原数据库保留，不覆盖已存在的磁盘版本。
- 文件存储须校验 DSL、附件摘要、revision，使用原子快照提交；失败不得显示保存成功。
- 更换目录先 flush，串行复制受管理数据到空目标，成功后原子切换配置；旧目录保留副本。不得覆盖目标已有内容。
- renderer 不接收任意路径读写权限，host 方法限定身份、文档、附件及原生 picker。
- 外部目录树与文稿树映射待用户澄清；先实现独立于该选择的持久化和设置链路。

## 验证

host 临时目录测试：保存/恢复、附件、并发旧版本、迁移幂等、失败/非空目录、目录切换/重启与隔离；类型检查、生产构建、Electron 存储端到端回归，实际 App 重启和 General 截图检查。

## 进度

- [x] 读取现有设置、存储和关闭 flush 机制。
- [x] 实现 host、platform、General 与迁移。
- [x] 回归、文档同步和实际 App 验收。

## 完成记录

67 文件 / 403 单测、类型检查、构建、desktop smoke 与新增 document-directory smoke 通过；真实 App 使用默认目录并成功迁移既有文稿和原件，Computer Use 验证设置、picker 取消和 Finder。浅深色 / 窄屏截图检查发现并修复响应式说明挤压。当前沿用语义文稿树，不把 Finder 层级当作正文结构；此范围在实施中已告知用户。细节见 document-directory 设计与同日 history。
