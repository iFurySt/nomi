## [2026-05-22 00:12] | Task: macOS record image cache

### User request

> 记录里的图片都没有缓存在本地，每次都重新加载。优化成加载过的图片会缓存在本地应用所在目录，目录由 Agent 选择。

### Changes

- **[macOS image cache]**: 新增 `CachedRemoteImage`，用图片 URL 的 SHA-256 hash 作为缓存文件名，把已加载 record 图片写入 `~/Library/Caches/<bundle-id>/RecordImages`。
- **[Record thumbnails]**: 将 record 列表、详情和放大页共用的 `RecordThumb` 从 `AsyncImage` 改为缓存优先加载；内存 cache 命中时直接使用 `NSCache`，磁盘 cache 命中时从本地文件读取，缺失时才请求 server 并落盘。
- **[Failure state]**: 保留原有图片加载失败时的 photo fallback，不让失败态一直停留在 loading spinner。
- **[Docs]**: 更新架构、前端说明和质量评分，记录 macOS record 图片缓存目录与覆盖范围。

### Why

record 图片来自 server `/images/...`，列表、详情和放大页会频繁重复展示同一 URL。放在 `~/Library/Caches/<bundle-id>/RecordImages` 符合 macOS app 缓存语义：目录属于 app，能跨启动复用，也允许系统在存储压力下清理。

### Validation

- `cd apps/macos/Nomi && ./scripts/build-app.sh`
- 清空 `~/Library/Caches/dev.nomi.mac/RecordImages` 后启动 app 指向 `https://nomi.ifuryst.com`，打开记录页会生成 hash 命名的图片缓存文件。
- 重启 app 后记录页图片直接显示；缓存文件的 mtime / size 与重启前一致，验证未重新下载覆盖。

### Files

- `apps/macos/Nomi/Sources/Nomi/CachedRemoteImage.swift`
- `apps/macos/Nomi/Sources/Nomi/ContentView.swift`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
- `docs/histories/2026-05/20260522-0012-macos-record-image-cache.md`
