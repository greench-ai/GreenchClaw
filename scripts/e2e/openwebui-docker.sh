#!/usr/bin/env bash
# Runs Open WebUI against a Dockerized GreenchClaw Gateway and verifies the proxied
# chat path with a real OpenAI-compatible request.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "GreenchClaw-openwebui-e2e" GREENCHCLAW_OPENWEBUI_E2E_IMAGE)"
OPENWEBUI_IMAGE="${OPENWEBUI_IMAGE:-ghcr.io/open-webui/open-webui:v0.8.10}"
# Keep the default on the preferred GPT-5 OpenAI model for Open WebUI
# compatibility smoke. Callers can still override this explicitly.
MODEL="${GREENCHCLAW_OPENWEBUI_MODEL:-openai/gpt-5.5}"
PROMPT_NONCE="OPENWEBUI_DOCKER_E2E_$(date +%s)_$$"
PROMPT="${GREENCHCLAW_OPENWEBUI_PROMPT:-Reply with exactly this token and nothing else: ${PROMPT_NONCE}}"
PORT="${GREENCHCLAW_OPENWEBUI_GATEWAY_PORT:-18789}"
WEBUI_PORT="${GREENCHCLAW_OPENWEBUI_PORT:-8080}"
TOKEN="openwebui-e2e-$(date +%s)-$$"
ADMIN_EMAIL="${GREENCHCLAW_OPENWEBUI_ADMIN_EMAIL:-openwebui-e2e@example.com}"
ADMIN_PASSWORD="${GREENCHCLAW_OPENWEBUI_ADMIN_PASSWORD:-OpenWebUI-E2E-Password-$(date +%s)-$$}"
NET_NAME="GreenchClaw-openwebui-e2e-$$"
GW_NAME="GreenchClaw-openwebui-gateway-$$"
OW_NAME="GreenchClaw-openwebui-$$"
PROVIDER_TIMEOUT_SECONDS="${GREENCHCLAW_OPENWEBUI_PROVIDER_TIMEOUT_SECONDS:-900}"
PROBE_FETCH_TIMEOUT_MS="${GREENCHCLAW_OPENWEBUI_FETCH_TIMEOUT_MS:-$((PROVIDER_TIMEOUT_SECONDS * 1000 + 60000))}"
DOCKER_COMMAND_TIMEOUT="${GREENCHCLAW_OPENWEBUI_DOCKER_COMMAND_TIMEOUT:-$((PROVIDER_TIMEOUT_SECONDS + 90))s}"
DOCKER_PULL_TIMEOUT="${GREENCHCLAW_OPENWEBUI_DOCKER_PULL_TIMEOUT:-600s}"
SMOKE_MODE="${OPENWEBUI_SMOKE_MODE:-${GREENCHCLAW_OPENWEBUI_SMOKE_MODE:-chat}}"

case "$SMOKE_MODE" in
  chat | models) ;;
  *)
    echo "Unsupported OPENWEBUI_SMOKE_MODE: $SMOKE_MODE" >&2
    exit 2
    ;;
esac

PROFILE_FILE="${GREENCHCLAW_TESTBOX_PROFILE_FILE:-$HOME/.GreenchClaw-testbox-live.profile}"
if [[ -f "$PROFILE_FILE" && -r "$PROFILE_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$PROFILE_FILE"
  set +a
fi

OPENAI_API_KEY_VALUE="${OPENAI_API_KEY:-}"
if [[ "$OPENAI_API_KEY_VALUE" == "undefined" || "$OPENAI_API_KEY_VALUE" == "null" ]]; then
  OPENAI_API_KEY_VALUE=""
fi
OPENAI_BASE_URL_VALUE="${OPENAI_BASE_URL:-}"
if [[ "$OPENAI_BASE_URL_VALUE" == "undefined" || "$OPENAI_BASE_URL_VALUE" == "null" ]]; then
  OPENAI_BASE_URL_VALUE=""
fi
if [[ -z "$OPENAI_API_KEY_VALUE" ]]; then
  echo "OPENAI_API_KEY is required for the Open WebUI Docker smoke." >&2
  exit 2
fi

cleanup() {
  docker_e2e_docker_cmd rm -f "$OW_NAME" >/dev/null 2>&1 || true
  docker_e2e_docker_cmd rm -f "$GW_NAME" >/dev/null 2>&1 || true
  docker_e2e_docker_cmd network rm "$NET_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker_e2e_build_or_reuse "$IMAGE_NAME" openwebui

echo "Pulling Open WebUI image: $OPENWEBUI_IMAGE"
timeout "$DOCKER_PULL_TIMEOUT" docker pull "$OPENWEBUI_IMAGE" >/dev/null

echo "Creating Docker network..."
docker_e2e_docker_cmd network create "$NET_NAME" >/dev/null

echo "Starting gateway container..."
# Harness files are mounted read-only; the app under test comes from /app/dist.
docker_e2e_harness_mount_args
docker_e2e_docker_cmd run -d \
  "${DOCKER_E2E_HARNESS_ARGS[@]}" \
  --name "$GW_NAME" \
  --network "$NET_NAME" \
  -e "GREENCHCLAW_GATEWAY_TOKEN=$TOKEN" \
  -e "GREENCHCLAW_OPENWEBUI_MODEL=$MODEL" \
  -e "GREENCHCLAW_SKIP_CHANNELS=1" \
  -e "GREENCHCLAW_SKIP_GMAIL_WATCHER=1" \
  -e "GREENCHCLAW_SKIP_CRON=1" \
  -e "GREENCHCLAW_SKIP_CANVAS_HOST=1" \
  -e "GREENCHCLAW_OPENWEBUI_PROVIDER_TIMEOUT_SECONDS=$PROVIDER_TIMEOUT_SECONDS" \
  -e OPENAI_API_KEY \
  ${OPENAI_BASE_URL_VALUE:+-e OPENAI_BASE_URL} \
  "$IMAGE_NAME" \
  bash -lc '
    set -euo pipefail
    source scripts/lib/GreenchClaw-e2e-instance.sh
    entry="$(GreenchClaw_e2e_resolve_entrypoint)"

    openai_api_key="${OPENAI_API_KEY:?OPENAI_API_KEY required}"
    batch_file="$(mktemp /tmp/GreenchClaw-openwebui-config.XXXXXX.json)"
    GREENCHCLAW_CONFIG_BATCH_PATH="$batch_file" node scripts/e2e/lib/fixture.mjs openwebui-config "$openai_api_key"
    node "$entry" config set --batch-file "$batch_file" >/dev/null
    rm -f "$batch_file"
    node scripts/e2e/lib/fixture.mjs openwebui-workspace

    GreenchClaw_e2e_exec_gateway "$entry" '"$PORT"' lan /tmp/openwebui-gateway.log
  ' >/dev/null

echo "Waiting for gateway HTTP surface..."
if ! docker_e2e_wait_container_bash "$GW_NAME" 240 1 "GREENCHCLAW_HTTP_PROBE_BEARER='$TOKEN' node scripts/e2e/lib/openwebui/http-probe.mjs 'http://127.0.0.1:$PORT/v1/models' 200"; then
  echo "Gateway failed to start"
  docker_e2e_docker_cmd inspect "$GW_NAME" --format '{{json .State}}' 2>/dev/null || true
  docker_e2e_tail_container_file_if_running "$GW_NAME" /tmp/openwebui-gateway.log 200
  exit 1
fi

echo "Starting Open WebUI container..."
docker_e2e_docker_cmd run -d \
  --name "$OW_NAME" \
  --network "$NET_NAME" \
  -e ENV=prod \
  -e WEBUI_NAME="GreenchClaw E2E" \
  -e WEBUI_SECRET_KEY="GreenchClaw-openwebui-e2e-secret-key-v1" \
  -e OFFLINE_MODE=True \
  -e ENABLE_VERSION_UPDATE_CHECK=False \
  -e ENABLE_PERSISTENT_CONFIG=False \
  -e ENABLE_OLLAMA_API=False \
  -e ENABLE_OPENAI_API=True \
  -e OPENAI_API_BASE_URLS="http://$GW_NAME:$PORT/v1" \
  -e OPENAI_API_KEY="$TOKEN" \
  -e OPENAI_API_KEYS="$TOKEN" \
  -e RAG_EMBEDDING_MODEL_AUTO_UPDATE=False \
  -e RAG_RERANKING_MODEL_AUTO_UPDATE=False \
  -e WEBUI_ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e WEBUI_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e WEBUI_ADMIN_NAME="GreenchClaw E2E" \
  -e ENABLE_SIGNUP=False \
  -e DEFAULT_MODELS="GreenchClaw/default" \
  "$OPENWEBUI_IMAGE" >/dev/null

echo "Waiting for Open WebUI..."
if ! docker_e2e_wait_container_bash_while_running "$OW_NAME" "$GW_NAME" 240 1 "node scripts/e2e/lib/openwebui/http-probe.mjs 'http://$OW_NAME:$WEBUI_PORT/' lt500"; then
  echo "Open WebUI failed to start"
  docker_e2e_docker_cmd logs "$OW_NAME" 2>&1 | tail -n 200 || true
  exit 1
fi

echo "Waiting for gateway model endpoint after Open WebUI startup..."
if ! docker_e2e_wait_container_bash "$GW_NAME" 90 5 "GREENCHCLAW_HTTP_PROBE_BEARER='$TOKEN' GREENCHCLAW_HTTP_PROBE_TIMEOUT_MS=8000 node scripts/e2e/lib/openwebui/http-probe.mjs 'http://$GW_NAME:$PORT/v1/models' 200"; then
  echo "Gateway model endpoint did not stay reachable after Open WebUI startup"
  docker_e2e_docker_cmd inspect "$GW_NAME" --format '{{json .State}}' 2>/dev/null || true
  docker_e2e_tail_container_file_if_running "$GW_NAME" /tmp/openwebui-gateway.log 200
  docker_e2e_docker_cmd logs "$OW_NAME" 2>&1 | tail -n 200 || true
  exit 1
fi

echo "Running Open WebUI -> GreenchClaw smoke..."
if ! docker_e2e_docker_cmd exec \
  -e "OPENWEBUI_BASE_URL=http://$OW_NAME:$WEBUI_PORT" \
  -e "OPENWEBUI_ADMIN_EMAIL=$ADMIN_EMAIL" \
  -e "OPENWEBUI_ADMIN_PASSWORD=$ADMIN_PASSWORD" \
  -e "OPENWEBUI_EXPECTED_NONCE=$PROMPT_NONCE" \
  -e "OPENWEBUI_PROMPT=$PROMPT" \
  -e "OPENWEBUI_SMOKE_MODE=$SMOKE_MODE" \
  -e "OPENWEBUI_MODEL_ATTEMPTS=72" \
  -e "OPENWEBUI_MODEL_RETRY_MS=5000" \
  -e "OPENWEBUI_FETCH_TIMEOUT_MS=$PROBE_FETCH_TIMEOUT_MS" \
  "$GW_NAME" \
  node /app/scripts/e2e/openwebui-probe.mjs >/tmp/openwebui-probe.log 2>&1; then
  cat /tmp/openwebui-probe.log 2>/dev/null || true
  echo "Open WebUI probe failed; gateway log tail:"
  docker_e2e_docker_cmd inspect "$GW_NAME" --format '{{json .State}}' 2>/dev/null || true
  docker_e2e_tail_container_file_if_running "$GW_NAME" /tmp/openwebui-gateway.log 200
  echo "Open WebUI container logs:"
  docker_e2e_docker_cmd logs "$OW_NAME" 2>&1 | tail -n 200 || true
  exit 1
fi

echo "OK"
