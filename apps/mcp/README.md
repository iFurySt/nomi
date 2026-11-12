# Nomi MCP

本机 stdio MCP 适配器。先启动 Nomi，在**Settings → MCP** 中启用 MCP 并复制配置 取得配置。Node 24+；App 必须保持一个工作区窗口打开。

源码构建：`pnpm build:mcp`。运行：

```sh
node apps/mcp/dist/main.mjs --connection /absolute/path/to/mcp/connection.json
```

`--read-only` 限制此客户端只读。不要把含 token 的连接文件复制给其他人；设置页复制的配置只包含路径。所有写操作使用读取时的 workspaceId / expectedRevision，加唯一 requestId；失败重试保留原 requestId 和参数。

完整工具、安装方式、边界与验证：[本机文稿 MCP](../../docs/design-docs/local-mcp.md)。
