# 笔记画布格式示例

这是 [整体设计](../notes-infinite-canvas.md) 和 [DSL 草案](../notes-canvas-dsl.md) 的静态语义样例，这份 KDL 文件包尚未接入运行时 parser。当前已落地 [Canvas 主工作区](../canvas-workspace-runtime.md)，使用相同内容 / 摆放边界的 JSON IR，本例不代表 KDL 包已能直接导入。

- [document.nomi](document.nomi)：一篇完整笔记、一个画布、三个摆放及附件声明。
- [Markdown 原文](text/b_intro.md)：包含行内 / 展示 LaTeX，独立可读写。
- [通用笔迹](ink/b_derivation.ink.json)：一个由四个真实示例采样点构成的笔画，不是识别文字或截图。
- [图片](assets/force.svg) 和 [文件附件](assets/reference.txt)：仓库生成的合成示例，digest 和字节数写入 DSL。

`p_note` 展示完整笔记；`p_figure` 独立展示该笔记中的图片块；`p_ink` 放大展示同一份手写内容。移动其中一个摆放不改正文，编辑笔迹内容则应更新两个视图。这是内容与空间表示分离的具体例子。

示例仅验证文件、引用及 hash 的静态一致性。KDL / Nomi parser、自动排版、手写转换、CRDT 合并、AI 命令和跨端编辑还需要按阶段 0 做实际实验。
