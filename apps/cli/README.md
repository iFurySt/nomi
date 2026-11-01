# Future desktop service boundary

0.1.0 runs documents and Canvas locally in Electron. The imported finance / MCP Go service was removed; no background service is built, bundled or started. A future backup / sync service should use a versioned IPC contract, explicit lifecycle ownership and the `.nomi` package boundary. This directory is a design placeholder, not a running service. The independent `apps/server` iOS backend is unchanged.
