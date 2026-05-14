# macOS delete and breadcrumb fix

## 用户诉求

三点菜单里的删除点击后没有真的删除，需要确认并补强删除接口；记录放大页出现了两层面包屑，只保留上面的，并让 `记录` 可以点击返回列表，分隔符使用更好看的 chevron 样式。

## 改动

- 补强 server 删除接口测试，断言 `DELETE /records/{id}` 确实调用 store 删除指定 id。
- macOS titlebar 增加自定义面包屑：`记录` 是可点击按钮，分隔符使用 SF Symbol `chevron.right`。
- 移除记录放大页内容区里的第二层面包屑，避免重复显示。
- 记录放大页继续保留左侧系统 sidebar，点击 titlebar 的 `记录` 返回记录列表。

## 验证

- `cd apps/server && go test ./...`
- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- 重启本地 8088 server 后，用真实 `POST /records` 创建 smoke 记录，再用 `DELETE /records/{id}` 删除，随后 `GET /records` 确认该 id 不再返回。

## 影响文件

- `apps/server/internal/app/handler_test.go`
- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
