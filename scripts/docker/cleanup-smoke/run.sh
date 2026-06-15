#!/usr/bin/env bash
set -euo pipefail

cd /repo

export GREENCHCLAW_STATE_DIR="/tmp/GreenchClaw-test"
export GREENCHCLAW_CONFIG_PATH="${GREENCHCLAW_STATE_DIR}/GreenchClaw.json"

echo "==> Build"
if ! pnpm build >/tmp/GreenchClaw-cleanup-build.log 2>&1; then
  cat /tmp/GreenchClaw-cleanup-build.log
  exit 1
fi

echo "==> Seed state"
mkdir -p "${GREENCHCLAW_STATE_DIR}/credentials"
mkdir -p "${GREENCHCLAW_STATE_DIR}/agents/main/sessions"
echo '{}' >"${GREENCHCLAW_CONFIG_PATH}"
echo 'creds' >"${GREENCHCLAW_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${GREENCHCLAW_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
if ! pnpm GreenchClaw reset --scope config+creds+sessions --yes --non-interactive >/tmp/GreenchClaw-cleanup-reset.log 2>&1; then
  cat /tmp/GreenchClaw-cleanup-reset.log
  exit 1
fi

test ! -f "${GREENCHCLAW_CONFIG_PATH}"
test ! -d "${GREENCHCLAW_STATE_DIR}/credentials"
test ! -d "${GREENCHCLAW_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${GREENCHCLAW_STATE_DIR}/credentials"
echo '{}' >"${GREENCHCLAW_CONFIG_PATH}"

echo "==> Uninstall (state only)"
if ! pnpm GreenchClaw uninstall --state --yes --non-interactive >/tmp/GreenchClaw-cleanup-uninstall.log 2>&1; then
  cat /tmp/GreenchClaw-cleanup-uninstall.log
  exit 1
fi

test ! -d "${GREENCHCLAW_STATE_DIR}"

echo "OK"
