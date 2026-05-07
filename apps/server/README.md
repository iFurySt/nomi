# Nomi Server

Go API skeleton for Nomi / 知己. It owns record persistence, mock Ask responses, and websocket coordination with the SeedX daemon exposed by the local `seedx` CLI.

## Local Setup

The default development database is:

```text
postgres://bytedance:bytedance@localhost:5432/nomi?sslmode=disable
```

Create the database in the existing local Postgres container:

```sh
docker exec postgres17 createdb -U bytedance nomi
```

The command is idempotent enough for local use if the database already exists.

## Run

```sh
go test ./...
NOMI_SEEDX_API_KEY=dev_seedx_key go run ./cmd/nomi-server --addr :8088
```

## Docker

```sh
docker build -t ghcr.io/ifuryst/nomi-server:local .
docker run --rm -p 127.0.0.1:8088:8088 \
  -e NOMI_DATABASE_URL='postgres://bytedance:bytedance@host.docker.internal:5432/nomi?sslmode=disable' \
  -e NOMI_SEEDX_API_KEY=dev_seedx_key \
  ghcr.io/ifuryst/nomi-server:local
```

amoylab deployment uses the Compose template in `infra/amoylab/` and the release flow documented in `docs/DEPLOYMENT.md`.

## SeedX Websocket

SeedX connects to the standard daemon endpoint:

```text
ws://localhost:8088/daemon/connect
```

Run it with the installed SeedX CLI:

```sh
seedx daemon connect --server-url http://localhost:8088 --api-key dev_seedx_key --once
```

Current SeedX flow:

1. SeedX sends `daemon:hello`.
2. Server accepts `Authorization: Bearer ...` when `NOMI_SEEDX_API_KEY` is configured.
3. Server sends `daemon:ping`; long-running SeedX daemon responds with `daemon:pong`.

`GET /seedx/ws` remains as a temporary compatibility path for older local smoke clients.

## Smoke

```sh
curl -s http://localhost:8088/health

curl -s http://localhost:8088/records \
  -H 'Content-Type: application/json' \
  -d '{"type":"food","source":"manual","title":"Lunch","summary":"Rice bowl","metadata":{"protein":"28 g"}}'
```

## Boundaries

The server returns mock Ask answers for now. Medical diagnosis, treatment, medication, dosage, emergency, disease risk, and abnormality language is blocked with non-medical boundary copy.
