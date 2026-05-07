#!/usr/bin/env bash

set -euo pipefail

cmd="${SSH_ORIGINAL_COMMAND:-}"
case "${cmd}" in
  ghcr-login-and-deploy)
    token="$(cat)"
    test -n "${token}"
    printf '%s' "${token}" | sudo /usr/local/sbin/nomi-deploy-root ghcr-login-and-deploy
    ;;
  deploy|health)
    sudo /usr/local/sbin/nomi-deploy-root "${cmd}"
    ;;
  *)
    echo "unsupported nomi deploy command" >&2
    exit 126
    ;;
esac

