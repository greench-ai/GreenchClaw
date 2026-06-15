#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="${GREENCHCLAW_LIVE_DOCKER_REPO_ROOT:-$SCRIPT_ROOT_DIR}"
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"
TRUSTED_HARNESS_DIR="${GREENCHCLAW_LIVE_DOCKER_TRUSTED_HARNESS_DIR:-$SCRIPT_ROOT_DIR}"
if [[ -z "$TRUSTED_HARNESS_DIR" || ! -d "$TRUSTED_HARNESS_DIR" ]]; then
  echo "ERROR: trusted live Docker harness directory not found: ${TRUSTED_HARNESS_DIR:-<empty>}." >&2
  exit 1
fi
TRUSTED_HARNESS_DIR="$(cd "$TRUSTED_HARNESS_DIR" && pwd)"
source "$TRUSTED_HARNESS_DIR/scripts/lib/live-docker-auth.sh"
IMAGE_NAME="${GREENCHCLAW_IMAGE:-GreenchClaw:local}"
LIVE_IMAGE_NAME="${GREENCHCLAW_LIVE_IMAGE:-${IMAGE_NAME}-live}"
PROFILE_FILE="$(GreenchClaw_live_default_profile_file)"
DOCKER_USER="${GREENCHCLAW_DOCKER_USER:-node}"
DOCKER_AUTH_PRESTAGED=0
DOCKER_TRUSTED_HARNESS_CONTAINER_DIR="/trusted-harness"
DOCKER_TRUSTED_HARNESS_MOUNT=(-v "$TRUSTED_HARNESS_DIR":"$DOCKER_TRUSTED_HARNESS_CONTAINER_DIR":ro)

GreenchClaw_live_truthy() {
  case "${1:-}" in
    1 | true | TRUE | yes | YES | on | ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

TEMP_DIRS=()
DOCKER_HOME_MOUNT=()
cleanup_temp_dirs() {
  if ((${#TEMP_DIRS[@]} > 0)); then
    rm -rf "${TEMP_DIRS[@]}"
  fi
}
trap cleanup_temp_dirs EXIT

if GreenchClaw_live_truthy "${GREENCHCLAW_DOCKER_PROFILE_ENV_ONLY:-}"; then
  CONFIG_DIR="$(mktemp -d)"
  WORKSPACE_DIR="$(mktemp -d)"
  TEMP_DIRS+=("$CONFIG_DIR" "$WORKSPACE_DIR")
  GREENCHCLAW_DOCKER_AUTH_DIRS=none
else
  CONFIG_DIR="${GREENCHCLAW_CONFIG_DIR:-$HOME/.GreenchClaw}"
  WORKSPACE_DIR="${GREENCHCLAW_WORKSPACE_DIR:-$HOME/.GreenchClaw/workspace}"
fi
if [[ -n "${GREENCHCLAW_DOCKER_CACHE_HOME_DIR:-}" ]]; then
  CACHE_HOME_DIR="${GREENCHCLAW_DOCKER_CACHE_HOME_DIR}"
elif GreenchClaw_live_is_ci; then
  CACHE_HOME_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/GreenchClaw-docker-cache.XXXXXX")"
  TEMP_DIRS+=("$CACHE_HOME_DIR")
else
  CACHE_HOME_DIR="$HOME/.cache/GreenchClaw/docker-cache"
fi
mkdir -p "$CACHE_HOME_DIR"
if GreenchClaw_live_is_ci; then
  DOCKER_USER="$(id -u):$(id -g)"
  DOCKER_HOME_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/GreenchClaw-docker-home.XXXXXX")"
  TEMP_DIRS+=("$DOCKER_HOME_DIR")
  DOCKER_HOME_MOUNT=(-v "$DOCKER_HOME_DIR":/home/node)
fi

PROFILE_MOUNT=()
PROFILE_STATUS="none"
if [[ -f "$PROFILE_FILE" && -r "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
  PROFILE_STATUS="$PROFILE_FILE"
fi

AUTH_DIRS=()
AUTH_FILES=()
if [[ -n "${GREENCHCLAW_DOCKER_AUTH_DIRS:-}" ]]; then
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(GreenchClaw_live_collect_auth_dirs)
  while IFS= read -r auth_file; do
    [[ -n "$auth_file" ]] || continue
    AUTH_FILES+=("$auth_file")
  done < <(GreenchClaw_live_collect_auth_files)
elif [[ -n "${GREENCHCLAW_LIVE_PROVIDERS:-}" || -n "${GREENCHCLAW_LIVE_GATEWAY_PROVIDERS:-}" ]]; then
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(
    {
      GreenchClaw_live_collect_auth_dirs_from_csv "${GREENCHCLAW_LIVE_PROVIDERS:-}"
      GreenchClaw_live_collect_auth_dirs_from_csv "${GREENCHCLAW_LIVE_GATEWAY_PROVIDERS:-}"
    } | awk '!seen[$0]++'
  )
  while IFS= read -r auth_file; do
    [[ -n "$auth_file" ]] || continue
    AUTH_FILES+=("$auth_file")
  done < <(
    {
      GreenchClaw_live_collect_auth_files_from_csv "${GREENCHCLAW_LIVE_PROVIDERS:-}"
      GreenchClaw_live_collect_auth_files_from_csv "${GREENCHCLAW_LIVE_GATEWAY_PROVIDERS:-}"
    } | awk '!seen[$0]++'
  )
else
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(GreenchClaw_live_collect_auth_dirs)
  while IFS= read -r auth_file; do
    [[ -n "$auth_file" ]] || continue
    AUTH_FILES+=("$auth_file")
  done < <(GreenchClaw_live_collect_auth_files)
fi
AUTH_DIRS_CSV=""
if ((${#AUTH_DIRS[@]} > 0)); then
  AUTH_DIRS_CSV="$(GreenchClaw_live_join_csv "${AUTH_DIRS[@]}")"
fi
AUTH_FILES_CSV=""
if ((${#AUTH_FILES[@]} > 0)); then
  AUTH_FILES_CSV="$(GreenchClaw_live_join_csv "${AUTH_FILES[@]}")"
fi

if [[ -n "${DOCKER_HOME_DIR:-}" ]]; then
  GreenchClaw_live_stage_auth_into_home "$DOCKER_HOME_DIR" "${AUTH_DIRS[@]}" --files "${AUTH_FILES[@]}"
  DOCKER_AUTH_PRESTAGED=1
fi

EXTERNAL_AUTH_MOUNTS=()
if ((${#AUTH_DIRS[@]} > 0)); then
  for auth_dir in "${AUTH_DIRS[@]}"; do
    auth_dir="$(GreenchClaw_live_validate_relative_home_path "$auth_dir")"
    host_path="$HOME/$auth_dir"
    if [[ -d "$host_path" ]]; then
      EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth/"$auth_dir":ro)
    fi
  done
fi
if ((${#AUTH_FILES[@]} > 0)); then
  for auth_file in "${AUTH_FILES[@]}"; do
    auth_file="$(GreenchClaw_live_validate_relative_home_path "$auth_file")"
    host_path="$HOME/$auth_file"
    if [[ -f "$host_path" ]]; then
      EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth-files/"$auth_file":ro)
    fi
  done
fi

read -r -d '' LIVE_TEST_CMD <<'EOF' || true
set -euo pipefail
[ -f "$HOME/.profile" ] && [ -r "$HOME/.profile" ] && source "$HOME/.profile" || true
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export COREPACK_HOME="${COREPACK_HOME:-$XDG_CACHE_HOME/node/corepack}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$XDG_CACHE_HOME/npm}"
export npm_config_cache="$NPM_CONFIG_CACHE"
mkdir -p "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE"
chmod 700 "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE" || true
if [ "${GREENCHCLAW_DOCKER_AUTH_PRESTAGED:-0}" != "1" ]; then
  IFS=',' read -r -a auth_dirs <<<"${GREENCHCLAW_DOCKER_AUTH_DIRS_RESOLVED:-}"
  IFS=',' read -r -a auth_files <<<"${GREENCHCLAW_DOCKER_AUTH_FILES_RESOLVED:-}"
  if ((${#auth_dirs[@]} > 0)); then
    for auth_dir in "${auth_dirs[@]}"; do
      [ -n "$auth_dir" ] || continue
      if [ -d "/host-auth/$auth_dir" ]; then
        mkdir -p "$HOME/$auth_dir"
        cp -R "/host-auth/$auth_dir/." "$HOME/$auth_dir"
        chmod -R u+rwX "$HOME/$auth_dir" || true
      fi
    done
  fi
  if ((${#auth_files[@]} > 0)); then
    for auth_file in "${auth_files[@]}"; do
      [ -n "$auth_file" ] || continue
      if [ -f "/host-auth-files/$auth_file" ]; then
        mkdir -p "$(dirname "$HOME/$auth_file")"
        cp "/host-auth-files/$auth_file" "$HOME/$auth_file"
        chmod u+rw "$HOME/$auth_file" || true
      fi
    done
  fi
fi
tmp_dir="$(mktemp -d)"
trusted_scripts_dir="${GREENCHCLAW_LIVE_DOCKER_SCRIPTS_DIR:-/src/scripts}"
source "$trusted_scripts_dir/lib/live-docker-stage.sh"
GreenchClaw_live_stage_source_tree "$tmp_dir"
GreenchClaw_live_stage_node_modules "$tmp_dir"
GreenchClaw_live_link_runtime_tree "$tmp_dir"
GreenchClaw_live_stage_state_dir "$tmp_dir/.GreenchClaw-state"
GreenchClaw_live_prepare_staged_config
cd "$tmp_dir"
pnpm test:live:models-profiles
EOF

GREENCHCLAW_LIVE_DOCKER_REPO_ROOT="$ROOT_DIR" "$TRUSTED_HARNESS_DIR/scripts/test-live-build-docker.sh"

echo "==> Run live model tests (profile keys)"
echo "==> Target: src/agents/models.profiles.live.test.ts"
echo "==> Profile env only: ${GREENCHCLAW_DOCKER_PROFILE_ENV_ONLY:-0}"
echo "==> Profile file: $PROFILE_STATUS"
echo "==> External auth dirs: ${AUTH_DIRS_CSV:-none}"
echo "==> External auth files: ${AUTH_FILES_CSV:-none}"
DOCKER_RUN_ARGS=(docker run --rm -t \
  -u "$DOCKER_USER" \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e GREENCHCLAW_SKIP_CHANNELS=1 \
  -e GREENCHCLAW_SUPPRESS_NOTES=1 \
  -e GREENCHCLAW_DOCKER_AUTH_PRESTAGED="$DOCKER_AUTH_PRESTAGED" \
  -e GREENCHCLAW_DOCKER_AUTH_DIRS_RESOLVED="$AUTH_DIRS_CSV" \
  -e GREENCHCLAW_DOCKER_AUTH_FILES_RESOLVED="$AUTH_FILES_CSV" \
  -e GREENCHCLAW_LIVE_DOCKER_SCRIPTS_DIR="${DOCKER_TRUSTED_HARNESS_CONTAINER_DIR}/scripts" \
  -e GREENCHCLAW_LIVE_DOCKER_SOURCE_STAGE_MODE="${GREENCHCLAW_LIVE_DOCKER_SOURCE_STAGE_MODE:-copy}" \
  -e GREENCHCLAW_LIVE_TEST=1 \
  -e GREENCHCLAW_LIVE_MODELS="${GREENCHCLAW_LIVE_MODELS:-modern}" \
  -e GREENCHCLAW_LIVE_PROVIDERS="${GREENCHCLAW_LIVE_PROVIDERS:-}" \
  -e GREENCHCLAW_LIVE_MAX_MODELS="${GREENCHCLAW_LIVE_MAX_MODELS:-12}" \
  -e GREENCHCLAW_LIVE_MODEL_TIMEOUT_MS="${GREENCHCLAW_LIVE_MODEL_TIMEOUT_MS:-}" \
  -e GREENCHCLAW_LIVE_REQUIRE_PROFILE_KEYS="${GREENCHCLAW_LIVE_REQUIRE_PROFILE_KEYS:-}" \
  -e GREENCHCLAW_LIVE_GATEWAY_MODELS="${GREENCHCLAW_LIVE_GATEWAY_MODELS:-}" \
  -e GREENCHCLAW_LIVE_GATEWAY_PROVIDERS="${GREENCHCLAW_LIVE_GATEWAY_PROVIDERS:-}" \
  -e GREENCHCLAW_LIVE_GATEWAY_MAX_MODELS="${GREENCHCLAW_LIVE_GATEWAY_MAX_MODELS:-}" \
  -e GREENCHCLAW_VITEST_FS_MODULE_CACHE=0)
GreenchClaw_live_append_array DOCKER_RUN_ARGS DOCKER_HOME_MOUNT
GreenchClaw_live_append_array DOCKER_RUN_ARGS DOCKER_TRUSTED_HARNESS_MOUNT
DOCKER_RUN_ARGS+=(\
  -v "$CACHE_HOME_DIR":/home/node/.cache \
  -v "$ROOT_DIR":/src:ro \
  -v "$CONFIG_DIR":/home/node/.GreenchClaw \
  -v "$WORKSPACE_DIR":/home/node/.GreenchClaw/workspace)
GreenchClaw_live_append_array DOCKER_RUN_ARGS EXTERNAL_AUTH_MOUNTS
GreenchClaw_live_append_array DOCKER_RUN_ARGS PROFILE_MOUNT
DOCKER_RUN_ARGS+=(\
  "$LIVE_IMAGE_NAME" \
  -lc "$LIVE_TEST_CMD")
"${DOCKER_RUN_ARGS[@]}"
