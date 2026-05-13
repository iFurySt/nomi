# Nomi / 知己

Nomi / 知己 是一个个人身体与生活记录产品，定位为 AI personal body log。第一阶段目标是低 effort 记录饮食、身体数据、图片 / 截图和日常上下文，并用 AI 帮用户整理、回顾和基于已有记录提问。

Nomi 不是医疗产品，不提供诊断、治疗、药物或急症判断。

## 当前状态

- 产品规格：`docs/product-specs/nomi-mvp.md`
- 设计方向：`docs/DESIGN.md`
- 执行计划：`docs/exec-plans/completed/2026-05-06-nomi-mvp-skeleton.md`
- iOS app：`apps/ios/`
- Server 部署：`docs/DEPLOYMENT.md`

## iOS 本地启动

```sh
xcodebuild -project apps/ios/Nomi.xcodeproj \
  -scheme Nomi \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=<simulator-udid>' \
  build
```

## 仓库检查

```sh
make check-docs
```

## Server 本地启动

```sh
docker exec postgres17 createdb -U bytedance nomi
cd apps/server
go test ./...
NOMI_SEEDX_API_KEY=dev_seedx_key go run ./cmd/nomi-server --addr :8088
```

## Server 发版

Server 通过 `server-v*` tag 触发 GitHub Actions，构建 `ghcr.io/ifuryst/nomi-server` 并部署到 `amoylab:/opt/nomi`。详细流程见 `docs/DEPLOYMENT.md`。

## SeedX 本地验证

SeedX 通过已安装的 `seedx` CLI 运行。先启动 Nomi server，再运行：

```sh
seedx daemon connect --server-url http://localhost:8088 --api-key dev_seedx_key --once
```

## 许可证

[MIT](LICENSE)
