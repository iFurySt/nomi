# Nomi / 知己

Nomi / 知己 是一个个人身体与生活记录产品，定位为 AI personal body log。第一阶段目标是低 effort 记录饮食、身体数据、图片 / 截图和日常上下文，并用 AI 帮用户整理、回顾和基于已有记录提问。

Nomi 不是医疗产品，不提供诊断、治疗、药物或急症判断。

## 当前状态

- 产品规格：`docs/product-specs/nomi-mvp.md`
- 设计方向：`docs/DESIGN.md`
- 执行计划：`docs/exec-plans/completed/2026-05-06-nomi-mvp-skeleton.md`
- Mobile skeleton：`apps/mobile/`

## Mobile 本地启动

```sh
cd apps/mobile
npm install
npm run typecheck
npm run smoke
npx expo start --web --port 8081
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
go run ./cmd/nomi-server --addr :8088
```

## SeedX Daemon 本地验证

先启动 server，再运行：

```sh
cd apps/seedx-daemon
go test ./...
go run ./cmd/nomi-seedx-daemon --server-url ws://localhost:8088/seedx/ws --once
```

## 许可证

[MIT](LICENSE)
