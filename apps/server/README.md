# Nomi Server

Go API for the Nomi family-health private beta.

## Responsibilities

- Email/password authentication, opaque sessions, one-household bootstrap and family invitations.
- Household-scoped people, assets, jobs, threads and messages.
- Filesystem `StorageProvider` and per-household versioned Agent workspaces.
- Persistent Postgres job queue and SeedX/Codex ingest/chat execution.

## Run locally

```sh
go test ./...

NOMI_DATABASE_URL='postgres://...' \
NOMI_DATA_ROOT='.nomi/data' \
NOMI_AGENT_WORKSPACE_ROOT='.nomi/data/workspaces' \
NOMI_BOOTSTRAP_INVITE_CODE='local-private-code' \
NOMI_ASSET_SIGNING_KEY='local-signing-key' \
NOMI_SEEDX_API_KEY='local-seedx-key' \
go run ./cmd/nomi-server --addr :8088
```

In another terminal:

```sh
seedx daemon connect \
  --server-url http://127.0.0.1:8088 \
  --api-key local-seedx-key
```

Default Codex reasoning effort is `low`. SeedX 0.2.1 currently applies an internal 60-second daemon command limit; `NOMI_SEEDX_COMMAND_TIMEOUT` is Nomi's outer wait limit and does not override that SeedX limit.

## API

Public:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`

Machine-authenticated:

- `GET /daemon/connect`
- `GET /agent/assets/{id}` with a signed URL

User-authenticated:

- `/v1/auth/logout`
- `/v1/household/invites`
- `/v1/people`
- `/v1/assets`
- `/v1/jobs`
- `/v1/threads`
- `/v1/threads/{id}/messages`

Every `/v1/*` path is wrapped by the top-level session middleware, including routes added later.
