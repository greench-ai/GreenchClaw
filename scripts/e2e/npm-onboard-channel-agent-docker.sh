#!/usr/bin/env bash
# Installs a prepared GreenchClaw npm tarball in Docker, runs non-interactive
# onboarding for a channel, and verifies one mocked model turn through Gateway.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"
source "$ROOT_DIR/scripts/lib/docker-e2e-package.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "GreenchClaw-npm-onboard-channel-agent-e2e" GREENCHCLAW_NPM_ONBOARD_E2E_IMAGE)"
DOCKER_TARGET="${GREENCHCLAW_NPM_ONBOARD_DOCKER_TARGET:-bare}"
HOST_BUILD="${GREENCHCLAW_NPM_ONBOARD_HOST_BUILD:-1}"
PACKAGE_TGZ="${GREENCHCLAW_CURRENT_PACKAGE_TGZ:-}"
CHANNEL="${GREENCHCLAW_NPM_ONBOARD_CHANNEL:-telegram}"

case "$CHANNEL" in
telegram | discord | slack) ;;
*)
  echo "GREENCHCLAW_NPM_ONBOARD_CHANNEL must be telegram, discord, or slack, got: $CHANNEL" >&2
  exit 1
  ;;
esac

docker_e2e_build_or_reuse "$IMAGE_NAME" npm-onboard-channel-agent "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "$DOCKER_TARGET"

prepare_package_tgz() {
  if [ -n "$PACKAGE_TGZ" ]; then
    PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz npm-onboard-channel-agent "$PACKAGE_TGZ")"
    return 0
  fi
  if [ "$HOST_BUILD" = "0" ] && [ -z "${GREENCHCLAW_CURRENT_PACKAGE_TGZ:-}" ]; then
    echo "GREENCHCLAW_NPM_ONBOARD_HOST_BUILD=0 requires GREENCHCLAW_CURRENT_PACKAGE_TGZ" >&2
    exit 1
  fi
  PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz npm-onboard-channel-agent)"
}

prepare_package_tgz

docker_e2e_package_mount_args "$PACKAGE_TGZ"
run_log="$(docker_e2e_run_log npm-onboard-channel-agent)"
GREENCHCLAW_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 npm-onboard-channel-agent empty)"

echo "Running npm tarball onboard/channel/agent Docker E2E ($CHANNEL)..."
if ! docker_e2e_run_with_harness \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e GREENCHCLAW_NPM_ONBOARD_CHANNEL="$CHANNEL" \
  -e "GREENCHCLAW_TEST_STATE_SCRIPT_B64=$GREENCHCLAW_TEST_STATE_SCRIPT_B64" \
  "${DOCKER_E2E_PACKAGE_ARGS[@]}" \
  -i "$IMAGE_NAME" bash -s >"$run_log" 2>&1 <<'EOF'; then
set -euo pipefail

source scripts/lib/GreenchClaw-e2e-instance.sh
GreenchClaw_e2e_eval_test_state_from_b64 "${GREENCHCLAW_TEST_STATE_SCRIPT_B64:?missing GREENCHCLAW_TEST_STATE_SCRIPT_B64}"
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
export OPENAI_API_KEY="sk-GreenchClaw-npm-onboard-e2e"
export GREENCHCLAW_GATEWAY_TOKEN="npm-onboard-channel-agent-token"

CHANNEL="${GREENCHCLAW_NPM_ONBOARD_CHANNEL:?missing GREENCHCLAW_NPM_ONBOARD_CHANNEL}"
PORT="18789"
MOCK_PORT="44080"
SUCCESS_MARKER="GREENCHCLAW_AGENT_E2E_OK_ASSISTANT"
MOCK_REQUEST_LOG="/tmp/GreenchClaw-mock-openai-requests.jsonl"
export SUCCESS_MARKER MOCK_REQUEST_LOG
mock_pid=""

case "$CHANNEL" in
  telegram)
    CHANNEL_TOKEN="123456:GreenchClaw-npm-onboard-token"
    DEP_SENTINEL="grammy"
    CHANNEL_ADD_ARGS=(--token "$CHANNEL_TOKEN")
    CHANNEL_CONFIG_TOKENS=("$CHANNEL_TOKEN")
    ;;
  discord)
    CHANNEL_TOKEN="GreenchClaw-npm-onboard-discord-token"
    DEP_SENTINEL="discord-api-types"
    CHANNEL_ADD_ARGS=(--token "$CHANNEL_TOKEN")
    CHANNEL_CONFIG_TOKENS=("$CHANNEL_TOKEN")
    ;;
  slack)
    SLACK_BOT_TOKEN="xoxb-GreenchClaw-npm-onboard-slack-token"
    SLACK_APP_TOKEN="xapp-GreenchClaw-npm-onboard-slack-token"
    DEP_SENTINEL="@slack/bolt"
    CHANNEL_ADD_ARGS=(--bot-token "$SLACK_BOT_TOKEN" --app-token "$SLACK_APP_TOKEN")
    CHANNEL_CONFIG_TOKENS=("$SLACK_BOT_TOKEN" "$SLACK_APP_TOKEN")
    ;;
  *)
    echo "unsupported channel: $CHANNEL" >&2
    exit 1
    ;;
esac

cleanup() {
  GreenchClaw_e2e_stop_process "${mock_pid:-}"
}
trap cleanup EXIT

dump_debug_logs() {
  local status="$1"
  echo "npm onboard/channel/agent scenario failed with exit code $status" >&2
  GreenchClaw_e2e_dump_logs \
    /tmp/GreenchClaw-install.log \
    /tmp/GreenchClaw-onboard.json \
    /tmp/GreenchClaw-channel-add.log \
    /tmp/GreenchClaw-channels-status.json \
    /tmp/GreenchClaw-channels-status.err \
    /tmp/GreenchClaw-status.txt \
    /tmp/GreenchClaw-status.err \
    /tmp/GreenchClaw-doctor.log \
    /tmp/GreenchClaw-agent.combined \
    /tmp/GreenchClaw-agent.err \
    /tmp/GreenchClaw-agent.json \
    /tmp/GreenchClaw-mock-openai.log \
    "$MOCK_REQUEST_LOG"
}
trap 'status=$?; dump_debug_logs "$status"; exit "$status"' ERR

GreenchClaw_e2e_install_package /tmp/GreenchClaw-install.log

command -v GreenchClaw >/dev/null
package_root="$(GreenchClaw_e2e_package_root)"
if [ -d "$package_root/dist/extensions/$CHANNEL" ]; then
  CHANNEL_PACKAGE_MODE="bundled"
else
  CHANNEL_PACKAGE_MODE="external"
  echo "$CHANNEL is not packaged with core GreenchClaw; expecting channel selection to install it on demand."
fi

mock_pid="$(GreenchClaw_e2e_start_mock_openai "$MOCK_PORT" /tmp/GreenchClaw-mock-openai.log)"
GreenchClaw_e2e_wait_mock_openai "$MOCK_PORT"

echo "Running non-interactive onboarding..."
GreenchClaw onboard --non-interactive --accept-risk \
  --mode local \
  --auth-choice openai-api-key \
  --secret-input-mode ref \
  --gateway-port "$PORT" \
  --gateway-bind loopback \
  --skip-daemon \
  --skip-ui \
  --skip-skills \
  --skip-health \
  --json >/tmp/GreenchClaw-onboard.json

node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-onboard-state "$HOME"
node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs configure-mock-model "$MOCK_PORT"

GreenchClaw_e2e_assert_dep_absent "$DEP_SENTINEL" "$HOME/.GreenchClaw"

echo "Configuring $CHANNEL..."
GreenchClaw channels add --channel "$CHANNEL" "${CHANNEL_ADD_ARGS[@]}" >/tmp/GreenchClaw-channel-add.log 2>&1
node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-channel-config "$CHANNEL" "${CHANNEL_CONFIG_TOKENS[@]}"

echo "Checking status surfaces for $CHANNEL..."
GreenchClaw channels status --json >/tmp/GreenchClaw-channels-status.json 2>/tmp/GreenchClaw-channels-status.err
GreenchClaw status >/tmp/GreenchClaw-status.txt 2>/tmp/GreenchClaw-status.err
node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-status-surfaces "$CHANNEL" /tmp/GreenchClaw-channels-status.json /tmp/GreenchClaw-status.txt

echo "Running doctor after channel activation..."
GreenchClaw doctor --repair --non-interactive >/tmp/GreenchClaw-doctor.log 2>&1
if [ "$CHANNEL_PACKAGE_MODE" = "external" ]; then
  GreenchClaw_e2e_assert_dep_present "$DEP_SENTINEL" "$HOME/.GreenchClaw"
else
  GreenchClaw_e2e_assert_dep_absent "$DEP_SENTINEL" "$HOME/.GreenchClaw"
fi

echo "Running local agent turn against mocked OpenAI..."
GreenchClaw agent --local \
  --agent main \
  --session-id npm-onboard-channel-agent \
  --message "Return the success marker from the test server." \
  --thinking off \
  --json >/tmp/GreenchClaw-agent.combined 2>&1

node scripts/e2e/lib/npm-onboard-channel-agent/assertions.mjs assert-agent-turn "$SUCCESS_MARKER" "$MOCK_REQUEST_LOG"

echo "npm tarball onboard/channel/agent Docker E2E passed for $CHANNEL"
EOF
  docker_e2e_print_log "$run_log"
  rm -f "$run_log"
  exit 1
fi

rm -f "$run_log"
echo "npm tarball onboard/channel/agent Docker E2E passed ($CHANNEL)"
