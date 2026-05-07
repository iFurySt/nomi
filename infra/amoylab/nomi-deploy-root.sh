#!/usr/bin/env bash

set -euo pipefail

APP_DIR=/opt/nomi
IMAGE_SOURCE_LABEL="org.opencontainers.image.source=https://github.com/iFurySt/nomi"
COMPOSE=(/usr/bin/docker compose --project-name nomi -f "${APP_DIR}/docker-compose.yml" --env-file "${APP_DIR}/.env")

nomi_port() {
  awk -F= '$1 == "NOMI_SERVER_PORT" {print $2}' "${APP_DIR}/.env" | tail -n 1
}

cleanup_images() {
  /usr/bin/docker image prune -af --filter "label=${IMAGE_SOURCE_LABEL}"
}

health() {
  port="$(nomi_port)"
  curl -fsS "http://127.0.0.1:${port:-8088}/health"
  printf '\n'
}

wait_for_health() {
  for _ in $(seq 1 30); do
    if health; then
      return 0
    fi
    sleep 2
  done
  health
}

deploy_with_current_auth() {
  "${COMPOSE[@]}" pull server
  "${COMPOSE[@]}" up -d server
  cleanup_images
  "${COMPOSE[@]}" ps
  wait_for_health
}

cmd="${1:-}"
case "${cmd}" in
  ghcr-login-and-deploy)
    token="$(cat)"
    test -n "${token}"
    docker_config="$(mktemp -d)"
    trap 'rm -rf "${docker_config}"' EXIT
    printf '%s' "${token}" | DOCKER_CONFIG="${docker_config}" /usr/bin/docker login ghcr.io -u ifuryst --password-stdin >/dev/null
    DOCKER_CONFIG="${docker_config}" "${COMPOSE[@]}" pull server
    "${COMPOSE[@]}" up -d server
    cleanup_images
    "${COMPOSE[@]}" ps
    wait_for_health
    ;;
  deploy)
    deploy_with_current_auth
    ;;
  health)
    health
    ;;
  *)
    echo "usage: nomi-deploy-root {ghcr-login-and-deploy|deploy|health}" >&2
    exit 64
    ;;
esac

