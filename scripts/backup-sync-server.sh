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
  db_command=(docker exec -i "${NOMI_SYNC_PG_CONTAINER}")
  db_options=(-U "${NOMI_SYNC_DB_USER:-nomi}" -d "${NOMI_SYNC_DB_NAME:-nomi_sync}")
else
  export PGDATABASE="${NOMI_SYNC_DATABASE_URL:?Set database URL}"
  db_command=()
  db_options=()
fi
# Deletion takes the exclusive form of this lock. Keep originals and their
# database references available across both phases of the paired backup.
python3 - "${backup_dir}" "${db_command[@]}" psql "${db_options[@]}" -- \
  "${db_command[@]}" pg_dump "${db_options[@]}" --format=custom --no-owner --no-privileges -- \
  "${sync_command[@]}" export-objects <<'BACKUP'
import gzip, pathlib, shutil, subprocess, sys
root = pathlib.Path(sys.argv[1])
commands = [[]]
for value in sys.argv[2:]:
    if value == "--":
        commands.append([])
    else:
        commands[-1].append(value)
psql, dump, export = commands
with subprocess.Popen(psql + ["-XqAt", "-v", "ON_ERROR_STOP=1"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) as lock:
    try:
        lock.stdin.write("SELECT 'locked' FROM pg_advisory_lock_shared(68410237);\n")
        lock.stdin.flush()
        if lock.stdout.readline().strip() != "locked":
            raise RuntimeError("Could not protect backup against account deletion")
        with (root / "database.dump").open("wb") as output:
            subprocess.run(dump, stdout=output, check=True)
        with gzip.open(root / "objects.tar.gz", "wb") as output, subprocess.Popen(export, stdout=subprocess.PIPE) as objects:
            shutil.copyfileobj(objects.stdout, output)
            if objects.wait():
                raise RuntimeError("Object export failed")
        if lock.poll() is not None:
            raise RuntimeError("Backup lock was lost")
    finally:
        lock.stdin.close()
BACKUP
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
