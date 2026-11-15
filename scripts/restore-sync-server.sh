#!/usr/bin/env bash
# Refuses existing database tables and nonempty originals; use an isolated target.
set -euo pipefail
umask 077
backup_dir="${1:?Usage: restore-sync-server.sh BACKUP_DIRECTORY}"
python3 - "${backup_dir}" <<'PY'
import hashlib,json,pathlib,sys
def digest(f):
    h=hashlib.sha256()
    for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
root=pathlib.Path(sys.argv[1]); manifest=json.loads((root/'COMPLETE.json').read_text())
assert manifest['format']=='nomi-sync-backup/v1','Unknown backup format'
for name in ('database.dump','objects.tar.gz'):
    with (root/name).open('rb') as f: assert digest(f)==manifest['files'][name],f'Corrupt {name}'
PY
if [[ -n "${NOMI_SYNC_SERVICE_CONTAINER:-}" ]]; then
  sync_command=(docker exec -i "${NOMI_SYNC_SERVICE_CONTAINER}" nomi-sync)
else
  sync_command=("${NOMI_SYNC_BINARY:?Set NOMI_SYNC_BINARY or NOMI_SYNC_SERVICE_CONTAINER}")
fi
if [[ -n "${NOMI_SYNC_PG_CONTAINER:-}" ]]; then
  psql_command=(docker exec -i "${NOMI_SYNC_PG_CONTAINER}" psql -U "${NOMI_SYNC_DB_USER:-nomi}" -d "${NOMI_SYNC_DB_NAME:-nomi_sync}")
  restore_command=(docker exec -i "${NOMI_SYNC_PG_CONTAINER}" pg_restore -U "${NOMI_SYNC_DB_USER:-nomi}" -d "${NOMI_SYNC_DB_NAME:-nomi_sync}")
else
  export PGDATABASE="${NOMI_SYNC_DATABASE_URL:?Set target database URL}"
  psql_command=(psql)
  restore_command=(pg_restore)
fi
count="$("${psql_command[@]}" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")"
[[ "${count}" == 0 ]] || { echo 'Restore requires an empty database. Existing data was not changed.' >&2; exit 1; }
gzip -dc "${backup_dir}/objects.tar.gz" | "${sync_command[@]}" import-objects
"${restore_command[@]}" --exit-on-error --no-owner --no-privileges < "${backup_dir}/database.dump"
"${sync_command[@]}" verify
printf 'Restore verified. Start the service only after checking the target configuration.\n'
