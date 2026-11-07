## [2026-11-07 10:47] | Task: 独立 Nomi(Dev) 开发应用

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 从现在开始使用 Nomi(Dev).app 开发测试，避免影响日常使用的 Nomi。

### 🛠 Changes Overview

**Scope:** Desktop 启动器、main、登录回跳、开发验收与协作约定。

- 本地生成 Nomi(Dev).app，bundle ID 为 com.ifuryst.nomi.dev，应用名 / 窗口标题 / 菜单一致；双击包与开发脚本采用同一开发标识。
- 启动前隔离 userData / 单实例锁，默认文稿库为系统 Documents 下 Nomi(Dev)，ChatGPT 数据保存在开发 profile。没有迁移或复制正式文稿和账号。
- 开发版仅注册 nomi-dev 登录回跳，不注册正式文稿类型，不启用正式自动更新；正式发行配置维持 Nomi。
- 仓库协作指南明确以后仅操作、重启开发版，优先后台隔离验收，不干扰正式版。

### 🧠 Design Intent (Why)

仅改展示名无法防止共用数据与单实例锁；开发环境必须连同文稿、登录身份、回跳及应用关联一起分离。

### 📁 Files Modified

- `scripts/desktop-runtime.mjs`
- `scripts/start-desktop.mjs`
- `scripts/dev-desktop.mjs`
- `scripts/check-desktop-dev.mjs`
- `apps/desktop/src/main.ts`
- `packages/core/src/app-links.ts`
- `packages/host/src/chatgpt-callback-page.ts`
- `packages/host/src/chatgpt-callback-page.test.ts`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/DESKTOP.md`
- `docs/DESKTOP_RELEASE.md`

### Validation

- `pnpm check`、`pnpm build` 通过。
- 登录回跳 3 项单测、桌面隔离 smoke、开发包标识 / URL / 无文稿关联与直接启动检查通过。
- Computer Use 实际确认 Nomi(Dev) 独立启动，General 指向开发文稿目录，账号未登录，自动更新禁用。没有退出、操作或迁移正式版。
- 旧生成启动器保留，默认脚本不再使用；开发包仍依赖本地 checkout，不作为发行制品。
