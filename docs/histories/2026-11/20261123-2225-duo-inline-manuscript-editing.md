## 2026-11-23 22:25 · Duo 正文原位编辑

### 用户诉求

编辑和阅读时保持同一套标题、段落、待办和公式排版。进入编辑后，点中一条公式才能修改它的 LaTeX。

### 实现

- iOS 含结构化 Markdown 的文稿共用离线渲染视图。文字与公式携带原文范围，单次输入只替换当前范围。原始公式定界符、同步块标识及相邻内容一并保留。
- 原生格式工具栏通过当前选区修改正文，勾选待办继续沿用文稿模型的更新逻辑。编辑锁覆盖原位输入。
- 在 WebKit 回归测试中检查普通文字进入编辑前后的标题、公式和待办位置，验证行内公式与独立公式的源码修改、定界符保留和重排。Duo UI 用例覆盖格式工具，以及点公式、修改、保存和重开文稿的完整流程。

### 主要文件

- `apps/ios/Reader/reader.jsx`
- `apps/ios/Sources/ManuscriptEditor.swift`、`ManuscriptPreview.swift`、`NomiMobileApp.swift`
- `apps/ios/Tests/ManuscriptRenderingTests.swift`、`apps/ios/UITests/ManuscriptTests.swift`
- `apps/ios/README.md`、`docs/UIUX_REFERENCE.md`
