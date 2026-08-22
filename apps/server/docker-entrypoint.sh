#!/bin/sh
set -eu

: "${NOMI_DATA_ROOT:=/var/lib/nomi}"

mkdir -p "$NOMI_DATA_ROOT/assets" "$NOMI_DATA_ROOT/workspaces"
chown nomi:nomi "$NOMI_DATA_ROOT" "$NOMI_DATA_ROOT/assets" "$NOMI_DATA_ROOT/workspaces"

exec su-exec nomi /usr/local/bin/nomi-server "$@"
