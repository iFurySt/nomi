#!/bin/sh
set -eu

: "${NOMI_IMAGE_STORAGE_DIR:=/var/lib/nomi/uploads}"

mkdir -p "$NOMI_IMAGE_STORAGE_DIR"
chown -R nomi:nomi "$NOMI_IMAGE_STORAGE_DIR"

exec su-exec nomi /usr/local/bin/nomi-server "$@"
