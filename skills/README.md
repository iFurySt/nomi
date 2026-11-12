# Nomi Skills

本目录是 Nomi Agent Skills 的版本化正式来源，采用标准 `SKILL.md` 目录结构；本机安装副本与分发 ZIP 都是派生物。

- [nomi-interactive](nomi-interactive/SKILL.md)：生成可导入文稿和画布的交互块。附平台中立 DSL 契约、紧凑设计规范、示例、独立离线校验器。

维护流程：修改 core / renderer / host 契约和示例构建脚本后，运行 `node scripts/build-interactive-skill.mjs`，再运行 `node scripts/check-interactive-skill.mjs`。不要只改安装目录。标准 Skill 可由支持 Agent Skills 的 harness 加载，也可直接读取 SKILL.md 及其引用文件；不依赖特定模型或 API。
