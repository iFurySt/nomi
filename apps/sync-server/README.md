# Nomi personal sync server

Independent Go + Cobra + PostgreSQL service for the current document-based Nomi. No household model, SeedX, legacy iOS API, Redis or desktop subprocess dependency.

Implementation is staged. The transactional content/auth core is implemented; attachment transport and desktop integration are tracked in [the plan](../../docs/exec-plans/active/20261115-personal-cloud-sync.md).

## Run locally

Use a dedicated PostgreSQL database, never the retired family database. Requires Go 1.26.1+.

```sh
export NOMI_SYNC_DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:5432/nomi_sync?sslmode=disable'
go run ./cmd/nomi-sync migrate
# Pipe a private password from a password manager or interactive input, not a CLI argument.
go run ./cmd/nomi-sync create-user --email you@example.com --password-stdin
go run ./cmd/nomi-sync serve --addr 127.0.0.1:8089
```

`serve` requires prior migration; migrations are transactional and checksummed. Remote access requires an HTTPS reverse proxy. The default listener is loopback. No public account registration; provision private users with the CLI. Login passwords are bcrypt-hashed; 30-day opaque device tokens are stored as hashes and can be revoked independently. Login is rate-limited by direct peer address; untrusted forwarding headers are ignored.

## Verification

From repository root:

```sh
./scripts/test-sync-server.sh
```

Starts a disposable loopback PostgreSQL 18 container, runs Go integration tests with the race detector, then removes only that test container. Tests use independent schemas and synthetic data. To use an existing **test-only** database set `NOMI_SYNC_TEST_DATABASE_URL`; no production database should be supplied. `go test` without that variable explicitly skips database integration cases.

## Protocol

Every protected route is under `/v1/` and requires `Authorization: Bearer <device token>`; permission checks use the authenticated owner. URLs identify a space but never confer access. Unsupported routes also require authentication. No browser cookie session or public static file directory.

- `POST /auth/login`: `{email,password,deviceId,deviceName}` → `{user,sessionId,deviceId,token,expiresAt}`.
- `GET /v1/me`, `GET /v1/sessions`, `DELETE /v1/sessions/{id}`.
- `GET /v1/spaces`, `POST /v1/spaces`: `{name}` creates a private library.
- `GET /v1/spaces/{space}/snapshot`: repeatable-read `{protocol,cursor,records}`.
- `GET /v1/spaces/{space}/changes?after=0&limit=50`: ordered **whole commit batches**, `{protocol,cursor,hasMore,changes}`; limit 1–100.
- `POST /v1/spaces/{space}/commit`: `{protocol:"nomi-sync/v1",requestId,mutations:[{kind,id,baseVersion,deleted,data}]}` → `{sequence,versions}`.
- `GET /v1/spaces/{space}/history/{kind}/{id}`: previous versions (initial endpoint capped at 500, pagination scheduled with retention UI).

Record kinds: `document` (native document header, excluding revision/content arrays, plus `noteOrder`), `note` (native note without block order), `order` (`{id:noteId,blocks:[...]}`), `block` (native block), `asset` (native asset metadata), `board` (native board). Shared block IDs occur once in a space. A library mirrors a native CanvasDocument, not one remote space per note. Native `document.home` IDs can repeat across isolated spaces.

Version 0 means not created; deleted IDs retain a version and require explicit current-version restoration. Order and parent changes are validated against the post-commit graph. A conflicting batch returns 409 `conflict` with current competing entities and applies nothing. A request ID is immutable; replay returns the original receipt even after subsequent edits. Changing its payload returns `request_reused`.

Postgres stores Markdown `source` in a `text` column and other payload in `jsonb`. A space row lock serializes commit watermarks; no auto-increment/commit-order gap can hide a change. Old content is archived in the same transaction; semantic no-ops create no version or change event. Snapshots are bounded full responses (4 MiB live entity data; 4,000 total entity identities including tombstones); incremental reads are paginated. Current Nomi native content budgets still apply when importing to the renderer. Server validates IDs, JSON budget, native block discriminators and references; native DSL/render validation remains required at the client trust boundary.

Objects must be ready before committing asset metadata. Object transport is the next implementation stage. Unknown protocol/schema/block types fail rather than being rewritten. JSON formatting is not preserved; Markdown source is.
