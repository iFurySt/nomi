# Nomi Server

Go API skeleton for Nomi / 知己. It owns record persistence, asynchronous image analysis, Ask API boundaries, and websocket coordination with the SeedX daemon exposed by the local `seedx` CLI.

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

Image uploads are stored under `.nomi/uploads` by default. Override with `NOMI_IMAGE_STORAGE_DIR=/path/to/uploads` when needed.
On macOS local development, HEIC uploads are also converted to a sibling JPEG with `sips` before SeedX/Codex analysis so Codex receives a readable image while the original upload remains stored.
Stored images are available through `GET /images/<yyyy-mm>/<file>` for local client preview surfaces. HEIC preview requests return the converted JPEG sidecar when one exists.

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
seedx daemon connect --server-url http://localhost:8088 --api-key dev_seedx_key
```

Current SeedX flow:

1. SeedX sends `daemon:hello`.
2. Server accepts `Authorization: Bearer ...` when `NOMI_SEEDX_API_KEY` is configured.
3. Server sends `daemon:ping`; long-running SeedX daemon responds with `daemon:pong`.
4. Image extraction sends `daemon:command` with `method:"run"` and `runtime:"codex"`; `params.input` contains a strict JSON text prompt plus a Codex v2 `{ "type": "localImage", "path": "..." }` item for the stored upload.
5. `POST /ai/extract-image` stores the image and immediately creates a `pending` record, then returns `202 Accepted` with that record.
6. A background worker marks the record `processing`, waits for SeedX `daemon:result`, parses the Codex text, and updates the same record to `completed`.
7. If SeedX or parsing fails, the record becomes `failed`; no nutrition fallback is generated.

Record status values are:

- `pending`: upload accepted and queued for analysis.
- `processing`: SeedX/Codex analysis is running.
- `completed`: analysis succeeded and record fields / nutrition metadata were updated.
- `failed`: analysis failed; clients should show an error state and avoid using nutrition metadata.

`GET /seedx/ws` remains as a temporary compatibility path for older local smoke clients.

## Smoke

```sh
curl -s http://localhost:8088/health

curl -s http://localhost:8088/records

curl -X DELETE http://localhost:8088/records/<record-id>

curl -I http://localhost:8088/images/2026-05/example.jpg

printf 'tiny-image' | base64 | tr -d '\n' | \
  jq -Rs '{asset_name:"smoke.jpg",source:"file",mime_type:"image/jpeg",image_base64:.}' | \
  curl -s http://localhost:8088/ai/extract-image \
  -H 'Content-Type: application/json' \
  --data-binary @-
```

The extraction smoke requires a long-running `seedx daemon connect ...` process, not `--once`.

## Boundaries

The Ask endpoint is not connected to an LLM yet. Medical diagnosis, treatment, medication, dosage, emergency, disease risk, and abnormality language is blocked with non-medical boundary copy.
