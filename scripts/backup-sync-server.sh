#!/usr/bin/env bash
# Native service or explicit Docker container IDs; no production target is inferred.
set -euo pipefail
umask 077
backup_dir="${1:?Usage: backup-sync-server.sh NEW_BACKUP_DIRECTORY}"
[[ ! -e "${backup_dir}" ]] || { echo 'Backup destination already exists.' >&2; exit 1; }
mkdir -p "${backup_dir}"
if [[ -n "${NOMI_SYNC_SERVICE_CONTAINER:-}" ]]; then
  sync_command=(docker exec -i "${NOMI_SYNC_SERVICE_CONTAINER}" nomi-sync)
else
  sync_command=("${NOMI_SYNC_BINARY:?Set NOMI_SYNC_BINARY or NOMI_SYNC_SERVICE_CONTAINER}")
fi
if [[ -n "${NOMI_SYNC_PG_CONTAINER:-}" ]]; then
  docker exec "${NOMI_SYNC_PG_CONTAINER}" pg_dump -U "${NOMI_SYNC_DB_USER:-nomi}" -d "${NOMI_SYNC_DB_NAME:-nomi_sync}" --format=custom --no-owner --no-privileges > "${backup_dir}/database.dump"
else
  PGDATABASE="${NOMI_SYNC_DATABASE_URL:?Set database URL}" pg_dump --format=custom --no-owner --no-privileges > "${backup_dir}/database.dump"
fi
# Dump first, then originals: immutable files cannot disappear while physical GC is disabled.
"${sync_command[@]}" export-objects | gzip > "${backup_dir}/objects.tar.gz"
python3 - "${backup_dir}" <<'PY'
import hashlib,json,pathlib,sys,datetime
def digest(f):
    h=hashlib.sha256()
    for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
root=pathlib.Path(sys.argv[1]); manifest={'format':'nomi-sync-backup/v1','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':{}}
for name in ('database.dump','objects.tar.gz'):
    with (root/name).open('rb') as f: manifest['files'][name]=digest(f)
(root/'COMPLETE.json').write_text(json.dumps(manifest,indent=2)+'\n')
PY
printf 'Backup completed: %s\n' "${backup_dir}"
