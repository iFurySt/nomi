# 修复 ChatGPT 登录后文稿库切换

## 问题
更新后显示了初始示例，Finder 中原有文稿仍在。根因为 UI 将 ChatGPT activeProfileId 当作文稿 profile，登录后从本机库切换到新账号库；并非原文稿丢失。

## 修改
会话 provider、NotesWorkspace 和 Canvas 共用固定本机 workspace identity。AI 凭据选择保持独立；没有修改真实正文、移动文件或自动合并旧工作区。

## 验证
类型检查、生产构建及 Electron 导航回归通过。新增两个模拟已登录账号及退出状态的重启 / Canvas 往返检查，原文稿层级和选中项保持可用。实际退出已保存的正式版，启动本机修复构建，确认 Transformer、使用教程、AI 及画布体验重新显示，原有另一工作区文件保留。正式发布的 0.1.3 尚未替换；此修复待后续版本发布。
