#!/usr/bin/env bash
# Creates only a dedicated synthetic database container; no existing database is touched.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${NOMI_SYNC_TEST_DATABASE_URL:-}" ]]; then
  cd "${repo_root}/apps/sync-server"
  go test -race -count=1 ./...
  exit
fi
container="nomi-sync-test-$$"
cleanup() { docker rm -f "${container}" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Loopback only, random host port, ephemeral test-only credentials.
docker run -d --rm --name "${container}" -p 127.0.0.1::5432 \
  -e POSTGRES_USER=nomi_test -e POSTGRES_PASSWORD=nomi_test_local \
  -e POSTGRES_DB=nomi_sync_test postgres:18 >/dev/null
ready=false
for i in $(seq 1 60); do
  if docker exec "${container}" pg_isready -U nomi_test -d nomi_sync_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "${ready}" == true ]] || { echo "Test PostgreSQL did not start"; exit 1; }
port="$(docker port "${container}" 5432/tcp | head -1 | cut -d: -f2)"
export NOMI_SYNC_TEST_DATABASE_URL="postgres://nomi_test:nomi_test_local@127.0.0.1:${port}/nomi_sync_test?sslmode=disable"
cd "${repo_root}/apps/sync-server"
go test -race -count=1 ./...
