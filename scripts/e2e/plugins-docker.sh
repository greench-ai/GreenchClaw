#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"
IMAGE_NAME="$(docker_e2e_resolve_image "GreenchClaw-plugins-e2e" GREENCHCLAW_PLUGINS_E2E_IMAGE)"

docker_e2e_build_or_reuse "$IMAGE_NAME" plugins

GREENCHCLAW_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 plugins empty)"
DOCKER_ENV_ARGS=(
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  -e "GREENCHCLAW_TEST_STATE_SCRIPT_B64=$GREENCHCLAW_TEST_STATE_SCRIPT_B64"
)
for env_name in \
  GREENCHCLAW_PLUGINS_E2E_CLAWHUB \
  GREENCHCLAW_PLUGINS_E2E_LIVE_CLAWHUB \
  GREENCHCLAW_PLUGINS_E2E_CLAWHUB_SPEC \
  GREENCHCLAW_PLUGINS_E2E_CLAWHUB_ID; do
  env_value="${!env_name:-}"
  if [[ -n "$env_value" && "$env_value" != "undefined" && "$env_value" != "null" ]]; then
    DOCKER_ENV_ARGS+=(-e "$env_name")
  fi
done
if [[ "${GREENCHCLAW_PLUGINS_E2E_LIVE_CLAWHUB:-0}" = "1" ]]; then
  for env_name in \
    GREENCHCLAW_CLAWHUB_URL \
    CLAWHUB_URL \
    GREENCHCLAW_CLAWHUB_TOKEN \
    CLAWHUB_TOKEN \
    CLAWHUB_AUTH_TOKEN; do
    env_value="${!env_name:-}"
    if [[ -n "$env_value" && "$env_value" != "undefined" && "$env_value" != "null" ]]; then
      DOCKER_ENV_ARGS+=(-e "$env_name")
    fi
  done
fi

echo "Running plugins Docker E2E..."
docker_e2e_run_logged_with_harness plugins-run "${DOCKER_ENV_ARGS[@]}" "$IMAGE_NAME" bash scripts/e2e/lib/plugins/sweep.sh

echo "OK"
