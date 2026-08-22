# Nomi / 知己

Nomi 是一个 mobile-first 的家庭健康资料 App。家庭成员在 iPhone 上上传报告、图片、PDF 或文字资料，服务端用 SeedX 驱动 Codex，在每个家庭隔离的 filesystem workspace 中归档原件、维护长期上下文，并基于这些资料连续对话。

当前是受信任家庭 private beta，不提供诊断、治疗、用药剂量或急症判断。

## 当前能力

- 邮箱密码登录、一次性家庭邀请、服务端 opaque session。
- 家庭成员档案、资料上传、异步处理状态和分析结果。
- 家庭或成员范围的连续对话，回答携带 workspace 相对路径引用。
- 原件与 Agent 上下文以 FS 为主，账号、权限、队列和 App projection 以 Postgres 为主。
- 全部 `/v1/*` 业务 API 默认要求用户会话；SeedX 使用独立机器凭据。

## 本地运行

```sh
cd apps/server
go test ./...
NOMI_DATABASE_URL='postgres://...' \
NOMI_BOOTSTRAP_INVITE_CODE='local-private-code' \
NOMI_SEEDX_API_KEY='local-seedx-key' \
go run ./cmd/nomi-server --addr :8088

seedx daemon connect \
  --server-url http://127.0.0.1:8088 \
  --api-key local-seedx-key
```

```sh
xcodebuild -project apps/ios/Nomi.xcodeproj \
  -scheme Nomi \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

首次注册使用 `NOMI_BOOTSTRAP_INVITE_CODE` 创建唯一家庭；之后由 owner 在 App 的“家庭”页生成一次性家人邀请码。

## 文档入口

- 产品范围：`docs/product-specs/family-private-beta.md`
- 架构：`docs/ARCHITECTURE.md`
- 部署：`docs/DEPLOYMENT.md`
- iOS：`docs/FRONTEND.md`
- 安全：`docs/SECURITY.md`
- 已完成执行计划：`docs/exec-plans/completed/20260822-family-health-app-v1.md`

Server 通过 `server-v*` tag 发布到 GHCR 并部署 amoylab。详见 `docs/DEPLOYMENT.md`。

## 许可证

[MIT](LICENSE)
