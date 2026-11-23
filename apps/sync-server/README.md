# Nomi personal sync server

Independent Go + Cobra + PostgreSQL service for the current document-based Nomi. No household model, SeedX, legacy iOS API, Redis or desktop subprocess dependency.

Personal sync v1 includes desktop opt-in, durable queues, conflicts, bounded history and restoration. Deployment and paired backup instructions: [deployment](../../docs/DEPLOYMENT.md). No production deployment is implied.

## Run locally

Use a dedicated PostgreSQL database, never the retired family database. Requires Go 1.26.1+.

```sh
export NOMI_SYNC_DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:5432/nomi_sync?sslmode=disable'
export NOMI_SYNC_OBJECT_DIR='/persistent/nomi-sync/objects'
go run ./cmd/nomi-sync migrate
# Pipe a private password from a password manager or interactive input, not a CLI argument.
go run ./cmd/nomi-sync create-user --email you@example.com --password-stdin
go run ./cmd/nomi-sync serve --addr 127.0.0.1:8089
```

`serve` requires prior migration; migrations are transactional and checksummed. Remote access requires an HTTPS reverse proxy. The default listener is loopback. No public account registration; provision private users with the CLI. Login passwords are bcrypt-hashed; 30-day opaque device tokens are stored as hashes and can be revoked independently. Login is rate-limited by direct peer address; untrusted forwarding headers are ignored.

Desktop browser sign-in supports password and configured Google / Apple identities. Both platforms use the same provider-subject mappings. Website client credentials and exact callback URLs are documented in [deployment](../../docs/DEPLOYMENT.md).

## Verification

From repository root:

```sh
./scripts/test-sync-server.sh
node scripts/check-sync-package.mjs
node scripts/check-sync-package.mjs --backup
# macOS: two isolated Electron clients, no real user documents
node scripts/check-sync-package.mjs --desktop
```

Starts a disposable loopback PostgreSQL 18 container, runs Go integration tests with the race detector, then removes only that test container. Tests use independent schemas and synthetic data. To use an existing **test-only** database set `NOMI_SYNC_TEST_DATABASE_URL`; no production database should be supplied. `go test` without that variable explicitly skips database integration cases.

## Protocol

Every protected route is under `/v1/` and requires `Authorization: Bearer <device token>`; permission checks use the authenticated owner. URLs identify a space but never confer access. Unsupported routes also require authentication. No browser cookie session or public static file directory.

- `POST /auth/login`: `{email,password,deviceId,deviceName}` → `{user,sessionId,deviceId,token,expiresAt}`.
- `POST /auth/native/challenge` and `POST /auth/native/exchange` accept Apple or Google identity proofs. A five-minute nonce is bound to the provider, device and optional signed-in session. A returning provider subject restores its original Nomi user. On first sign-in, a verified email from the signed token selects an existing user or creates a passwordless user. The website uses the same lookup. Configure the Google iOS audience with `NOMI_GOOGLE_IOS_CLIENT_ID`.
- `GET /v1/identities` lists providers linked to the authenticated user.
- `GET /v1/me`, `GET /v1/sessions`, `DELETE /v1/sessions/{id}`.
- `GET /v1/spaces`, `POST /v1/spaces`: `{name}` creates a private library.
- `GET /v1/spaces/{space}/snapshot`: repeatable-read `{protocol,cursor,records}`.
- `GET /v1/spaces/{space}/changes?after=0&limit=50`: ordered **whole commit batches**, `{protocol,cursor,hasMore,changes}`; limit 1–100, also byte-bounded; a commit is never split.
- `POST /v1/spaces/{space}/commit`: `{protocol:"nomi-sync/v1",requestId,mutations:[{kind,id,baseVersion,deleted,data}]}` → `{sequence,versions}`.
- `GET /v1/spaces/{space}/history/{kind}/{id}`: previous versions, newest first; `?before=VERSION&limit=50` (exclusive cursor, 1–500). Each page is byte-bounded; continue from its last version until empty.

Record kinds: `document` (native document header, excluding revision/content arrays, plus `noteOrder`), `note` (native note without block order), `order` (`{id:noteId,blocks:[...]}`), `block` (native block), `asset` (native asset metadata), `board` (native board). Shared block IDs occur once in a space. A library mirrors a native CanvasDocument, not one remote space per note. Native `document.home` IDs can repeat across isolated spaces.

Version 0 means not created; deleted IDs retain a version and require explicit current-version restoration. Order and parent changes are validated against the post-commit graph. A conflicting batch returns 409 `conflict` with current competing entities and applies nothing. A request ID is immutable; replay returns the original receipt even after subsequent edits. Changing its payload returns `request_reused`.

Postgres stores Markdown `source` in a `text` column and other payload in `jsonb`. A space row lock serializes commit watermarks; no auto-increment/commit-order gap can hide a change. Old content is archived in the same transaction; semantic no-ops create no version or change event. Snapshots are bounded full responses (4 MiB live entity data; 4,000 total entity identities including tombstones); incremental reads are paginated. Current Nomi native content budgets still apply when importing to the renderer. Server validates IDs, JSON budget, native block discriminators and references; native DSL/render validation remains required at the client trust boundary.

Objects must be ready before committing asset metadata. `PUT /v1/spaces/{space}/objects/{sha256}` streams originals (max 20 MiB), checks digest and size, and durably publishes before recording readiness. Authenticated `GET` / `HEAD` on the same path support download and byte ranges. Disk objects use a private persistent directory, confined paths and immutable content-addressed writes. Asset IDs keep immutable hash, size and MIME identity even across deletion/restoration. No physical object GC is enabled. The package smoke command runs an isolated server/database with two synthetic native document directories and verifies asset hashes, native roundtrip and one-block incremental edits. Unknown protocol/schema/block types fail rather than being rewritten. JSON formatting is not preserved; Markdown source is.

## Retention and recovery

`nomi-sync maintain` reports candidates; `--apply` prunes. The server also runs maintenance on startup and every 24 hours. Each entity keeps the union of the latest 50 archived versions and every version archived within 30 days. Current versions do not consume that quota. Only a contiguous 90-day-old log prefix is removed; stale cursors return `reset_required`. Tombstones, request receipts and immutable asset identities remain. Object audit reports never-published originals older than seven days; no physical object deletion occurs.

`export-objects` streams a verified tar to stdout; `import-objects` reads a tar from stdin and requires an empty object directory. `verify` checks migrations, live document graphs and every ready original's length/hash. Use the repository backup/restore scripts to pair a PostgreSQL dump with originals and a SHA-256 manifest. A complete tar without the matching database dump is not a library backup.

Operational logs contain only operation, HTTP status and duration, never request content or credentials. The client settings show pending/error/conflict state and last synchronization. This is a private beta service: provision accounts explicitly, monitor disk/database growth, and keep off-host encrypted backups before real use.

Authenticated `DELETE /v1/me` with JSON `{"confirm":"DELETE"}` permanently deletes the caller's account and cloud libraries and invalidates their sessions. Attachment directories are queued for durable removal and retried by the service. Account deletion never accepts a caller-supplied user ID. Use the paired backup script for consistency across account deletions.
