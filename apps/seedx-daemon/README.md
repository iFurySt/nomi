# Nomi SeedX Daemon

Local daemon skeleton for connecting a user device to the Nomi server websocket. In production, this process is expected to run near SeedX on the user's device and actively connect to a cloud server URL.

## Run

```sh
go test ./...
go run ./cmd/nomi-seedx-daemon --server-url ws://localhost:8088/seedx/ws --once
```

## Event Envelope

The skeleton keeps a thin JSON event envelope so the real SeedX payload can stay mostly transparent later:

```json
{
  "id": "server-smoke-1",
  "type": "seedx.request",
  "created_at": "2026-05-06T08:00:00Z",
  "payload": {}
}
```

Current mock flow:

1. Daemon connects to `GET /seedx/ws`.
2. Daemon sends `daemon.ready`.
3. Server sends `seedx.request`.
4. Daemon sends `seedx.response`.
