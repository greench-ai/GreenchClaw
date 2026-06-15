#!/usr/bin/env bash
# Installs an GreenchClaw package candidate in Docker, performs Telegram
# onboarding/doctor recovery, then runs the Telegram QA live harness.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "GreenchClaw-npm-telegram-live-e2e" GREENCHCLAW_NPM_TELEGRAM_LIVE_E2E_IMAGE)"
DOCKER_TARGET="${GREENCHCLAW_NPM_TELEGRAM_DOCKER_TARGET:-build}"
PACKAGE_SPEC="${GREENCHCLAW_NPM_TELEGRAM_PACKAGE_SPEC:-GreenchClaw@beta}"
PACKAGE_TGZ="${GREENCHCLAW_NPM_TELEGRAM_PACKAGE_TGZ:-${GREENCHCLAW_CURRENT_PACKAGE_TGZ:-}}"
PACKAGE_LABEL="${GREENCHCLAW_NPM_TELEGRAM_PACKAGE_LABEL:-}"
OUTPUT_DIR="${GREENCHCLAW_NPM_TELEGRAM_OUTPUT_DIR:-.artifacts/qa-e2e/npm-telegram-live}"

resolve_credential_source() {
  if [ -n "${GREENCHCLAW_NPM_TELEGRAM_CREDENTIAL_SOURCE:-}" ]; then
    printf "%s" "$GREENCHCLAW_NPM_TELEGRAM_CREDENTIAL_SOURCE"
    return 0
  fi
  if [ -n "${GREENCHCLAW_QA_CREDENTIAL_SOURCE:-}" ]; then
    printf "%s" "$GREENCHCLAW_QA_CREDENTIAL_SOURCE"
    return 0
  fi
  if [ -n "${CI:-}" ] && [ -n "${GREENCHCLAW_QA_CONVEX_SITE_URL:-}" ]; then
    if [ -n "${GREENCHCLAW_QA_CONVEX_SECRET_CI:-}" ] || [ -n "${GREENCHCLAW_QA_CONVEX_SECRET_MAINTAINER:-}" ]; then
      printf "convex"
    fi
  fi
}

resolve_credential_role() {
  if [ -n "${GREENCHCLAW_NPM_TELEGRAM_CREDENTIAL_ROLE:-}" ]; then
    printf "%s" "$GREENCHCLAW_NPM_TELEGRAM_CREDENTIAL_ROLE"
    return 0
  fi
  if [ -n "${GREENCHCLAW_QA_CREDENTIAL_ROLE:-}" ]; then
    printf "%s" "$GREENCHCLAW_QA_CREDENTIAL_ROLE"
  fi
}

validate_GreenchClaw_package_spec() {
  local spec="$1"
  if [[ "$spec" =~ ^GreenchClaw@(alpha|beta|latest|[0-9]{4}\.[1-9][0-9]*\.[1-9][0-9]*(-[1-9][0-9]*|-(alpha|beta)\.[1-9][0-9]*)?)$ ]]; then
    return 0
  fi
  echo "GREENCHCLAW_NPM_TELEGRAM_PACKAGE_SPEC must be GreenchClaw@alpha, GreenchClaw@beta, GreenchClaw@latest, or an exact GreenchClaw release version; got: $spec" >&2
  exit 1
}

resolve_package_tgz() {
  local candidate="$1"
  if [ -z "$candidate" ]; then
    return 0
  fi
  if [ ! -f "$candidate" ]; then
    echo "GREENCHCLAW_NPM_TELEGRAM_PACKAGE_TGZ must point to an existing .tgz file; got: $candidate" >&2
    exit 1
  fi
  case "$candidate" in
    *.tgz) ;;
    *)
      echo "GREENCHCLAW_NPM_TELEGRAM_PACKAGE_TGZ must point to a .tgz file; got: $candidate" >&2
      exit 1
      ;;
  esac
  local dir
  local base
  dir="$(cd "$(dirname "$candidate")" && pwd)"
  base="$(basename "$candidate")"
  printf "%s/%s" "$dir" "$base"
}

package_mount_args=()
package_install_source="$PACKAGE_SPEC"
resolved_package_tgz="$(resolve_package_tgz "$PACKAGE_TGZ")"
if [ -n "$resolved_package_tgz" ]; then
  package_install_source="/package-under-test/$(basename "$resolved_package_tgz")"
  package_mount_args=(-v "$resolved_package_tgz:$package_install_source:ro")
else
  validate_GreenchClaw_package_spec "$PACKAGE_SPEC"
fi
if [ -z "$PACKAGE_LABEL" ]; then
  if [ -n "$resolved_package_tgz" ]; then
    PACKAGE_LABEL="$(basename "$resolved_package_tgz")"
  else
    PACKAGE_LABEL="$PACKAGE_SPEC"
  fi
fi

credential_source="$(resolve_credential_source)"
credential_role="$(resolve_credential_role)"
if [ -z "$credential_role" ] && [ -n "${CI:-}" ] && [ "$credential_source" = "convex" ]; then
  credential_role="ci"
fi

validate_credential_preflight() {
  if [ "${GREENCHCLAW_NPM_TELEGRAM_SKIP_CREDENTIAL_PREFLIGHT:-0}" = "1" ]; then
    return 0
  fi
  if [ "$credential_source" = "convex" ]; then
    if [ -z "${GREENCHCLAW_QA_CONVEX_SITE_URL:-}" ]; then
      echo "Missing required env for Convex credential mode: GREENCHCLAW_QA_CONVEX_SITE_URL" >&2
      exit 1
    fi
    if [ "$credential_role" = "ci" ]; then
      if [ -z "${GREENCHCLAW_QA_CONVEX_SECRET_CI:-}" ]; then
        echo "Missing required env for Convex ci credential mode: GREENCHCLAW_QA_CONVEX_SECRET_CI" >&2
        exit 1
      fi
      return 0
    fi
    if [ "$credential_role" = "maintainer" ]; then
      if [ -z "${GREENCHCLAW_QA_CONVEX_SECRET_MAINTAINER:-}" ]; then
        echo "Missing required env for Convex maintainer credential mode: GREENCHCLAW_QA_CONVEX_SECRET_MAINTAINER" >&2
        exit 1
      fi
      return 0
    fi
    if [ -z "${GREENCHCLAW_QA_CONVEX_SECRET_CI:-}" ] && [ -z "${GREENCHCLAW_QA_CONVEX_SECRET_MAINTAINER:-}" ]; then
      echo "Missing required env for Convex credential mode: GREENCHCLAW_QA_CONVEX_SECRET_CI or GREENCHCLAW_QA_CONVEX_SECRET_MAINTAINER" >&2
      exit 1
    fi
    return 0
  fi

  local missing=()
  for key in \
    GREENCHCLAW_QA_TELEGRAM_GROUP_ID \
    GREENCHCLAW_QA_TELEGRAM_DRIVER_BOT_TOKEN \
    GREENCHCLAW_QA_TELEGRAM_SUT_BOT_TOKEN; do
    if [ -z "${!key:-}" ]; then
      missing+=("$key")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    {
      echo "Missing required Telegram QA credential env before Docker work: ${missing[*]}"
      echo "Use one of:"
      echo "  direct Telegram env: GREENCHCLAW_QA_TELEGRAM_GROUP_ID, GREENCHCLAW_QA_TELEGRAM_DRIVER_BOT_TOKEN, GREENCHCLAW_QA_TELEGRAM_SUT_BOT_TOKEN"
      echo "  Convex env: GREENCHCLAW_NPM_TELEGRAM_CREDENTIAL_SOURCE=convex plus GREENCHCLAW_QA_CONVEX_SITE_URL and a role secret"
    } >&2
    exit 1
  fi
}

validate_credential_preflight

docker_e2e_build_or_reuse "$IMAGE_NAME" npm-telegram-live "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "$DOCKER_TARGET"

mkdir -p "$ROOT_DIR/.artifacts/qa-e2e"
run_log="$(mktemp "${TMPDIR:-/tmp}/GreenchClaw-npm-telegram-live.XXXXXX")"
npm_prefix_host="$(mktemp -d "$ROOT_DIR/.artifacts/qa-e2e/npm-telegram-live-prefix.XXXXXX")"
trap 'rm -f "$run_log"; rm -rf "$npm_prefix_host"' EXIT

docker_env=(
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  -e GREENCHCLAW_NPM_TELEGRAM_PACKAGE_SPEC="$PACKAGE_SPEC"
  -e GREENCHCLAW_NPM_TELEGRAM_PACKAGE_LABEL="$PACKAGE_LABEL"
  -e GREENCHCLAW_NPM_TELEGRAM_OUTPUT_DIR="$OUTPUT_DIR"
  -e GREENCHCLAW_NPM_TELEGRAM_FAST="${GREENCHCLAW_NPM_TELEGRAM_FAST:-1}"
)

forward_env_if_set() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    docker_env+=(-e "$key")
  fi
}

if [ -n "$credential_source" ]; then
  docker_env+=(-e GREENCHCLAW_QA_CREDENTIAL_SOURCE="$credential_source")
fi
if [ -n "$credential_role" ]; then
  docker_env+=(-e GREENCHCLAW_QA_CREDENTIAL_ROLE="$credential_role")
fi

for key in \
  OPENAI_API_KEY \
  ANTHROPIC_API_KEY \
  GEMINI_API_KEY \
  GOOGLE_API_KEY \
  GREENCHCLAW_LIVE_OPENAI_KEY \
  GREENCHCLAW_LIVE_ANTHROPIC_KEY \
  GREENCHCLAW_LIVE_GEMINI_KEY \
  GREENCHCLAW_QA_TELEGRAM_GROUP_ID \
  GREENCHCLAW_QA_TELEGRAM_DRIVER_BOT_TOKEN \
  GREENCHCLAW_QA_TELEGRAM_SUT_BOT_TOKEN \
  GREENCHCLAW_QA_CONVEX_SITE_URL \
  GREENCHCLAW_QA_CONVEX_SECRET_CI \
  GREENCHCLAW_QA_CONVEX_SECRET_MAINTAINER \
  GREENCHCLAW_QA_CREDENTIAL_LEASE_TTL_MS \
  GREENCHCLAW_QA_CREDENTIAL_HEARTBEAT_INTERVAL_MS \
  GREENCHCLAW_QA_CREDENTIAL_ACQUIRE_TIMEOUT_MS \
  GREENCHCLAW_QA_CREDENTIAL_HTTP_TIMEOUT_MS \
  GREENCHCLAW_QA_CONVEX_ENDPOINT_PREFIX \
  GREENCHCLAW_QA_CREDENTIAL_OWNER_ID \
  GREENCHCLAW_QA_ALLOW_INSECURE_HTTP \
  GREENCHCLAW_QA_REDACT_PUBLIC_METADATA \
  GREENCHCLAW_QA_TELEGRAM_CAPTURE_CONTENT \
  GREENCHCLAW_QA_TELEGRAM_CANARY_TIMEOUT_MS \
  GREENCHCLAW_QA_TELEGRAM_SCENARIO_TIMEOUT_MS \
  GREENCHCLAW_QA_SUITE_PROGRESS \
  GREENCHCLAW_NPM_TELEGRAM_PROVIDER_MODE \
  GREENCHCLAW_NPM_TELEGRAM_MODEL \
  GREENCHCLAW_NPM_TELEGRAM_ALT_MODEL \
  GREENCHCLAW_NPM_TELEGRAM_SCENARIOS \
  GREENCHCLAW_NPM_TELEGRAM_SKIP_HOTPATH \
  GREENCHCLAW_NPM_TELEGRAM_SUT_ACCOUNT \
  GREENCHCLAW_NPM_TELEGRAM_ALLOW_FAILURES; do
  forward_env_if_set "$key"
done

run_logged() {
  if ! "$@" >"$run_log" 2>&1; then
    cat "$run_log"
    exit 1
  fi
  cat "$run_log"
  >"$run_log"
}

echo "Running package Telegram live Docker E2E ($PACKAGE_LABEL)..."
run_logged docker run --rm \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e GREENCHCLAW_NPM_TELEGRAM_INSTALL_SOURCE="$package_install_source" \
  -e GREENCHCLAW_NPM_TELEGRAM_PACKAGE_LABEL="$PACKAGE_LABEL" \
  ${package_mount_args[@]+"${package_mount_args[@]}"} \
  -v "$npm_prefix_host:/npm-global" \
  -i "$IMAGE_NAME" bash -s <<'EOF'
set -euo pipefail

export HOME="$(mktemp -d "/tmp/GreenchClaw-npm-telegram-install.XXXXXX")"
export NPM_CONFIG_PREFIX="/npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"

install_source="${GREENCHCLAW_NPM_TELEGRAM_INSTALL_SOURCE:?missing GREENCHCLAW_NPM_TELEGRAM_INSTALL_SOURCE}"
package_label="${GREENCHCLAW_NPM_TELEGRAM_PACKAGE_LABEL:-$install_source}"
echo "Installing ${package_label} from ${install_source}..."
npm install -g "$install_source" --no-fund --no-audit

command -v GreenchClaw
GreenchClaw --version
EOF

# Mount only QA harness source; the SUT itself, including bundled plugin runtime,
# is the installed package candidate.
run_logged docker_e2e_run_with_harness \
  "${docker_env[@]}" \
  -v "$ROOT_DIR/.artifacts:/app/.artifacts" \
  -v "$ROOT_DIR/extensions/qa-lab:/app/extensions/qa-lab:ro" \
  -v "$npm_prefix_host:/npm-global" \
  -i "$IMAGE_NAME" bash -s <<'EOF'
set -euo pipefail

export HOME="$(mktemp -d "/tmp/GreenchClaw-npm-telegram-runtime.XXXXXX")"
export NPM_CONFIG_PREFIX="/npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
export GREENCHCLAW_NPM_TELEGRAM_REPO_ROOT="/app"

dump_hotpath_logs() {
  local status="$1"
  echo "installed-package onboarding recovery hot path failed with exit code $status" >&2
  for file in \
    /tmp/GreenchClaw-npm-telegram-onboard.json \
    /tmp/GreenchClaw-npm-telegram-channel-add.log \
    /tmp/GreenchClaw-npm-telegram-doctor-fix.log \
    /tmp/GreenchClaw-npm-telegram-doctor-check.log; do
    if [ -f "$file" ]; then
      echo "--- $file ---" >&2
      sed -n '1,220p' "$file" >&2 || true
    fi
  done
}
trap 'status=$?; dump_hotpath_logs "$status"; exit "$status"' ERR

command -v GreenchClaw
GreenchClaw --version
mkdir -p /app/node_modules
GreenchClaw_package_dir="/npm-global/lib/node_modules/GreenchClaw"
# The mounted QA harness imports GreenchClaw/plugin-sdk and package dependencies;
# point those imports at the installed package without copying source plugins into the test image.
rm -rf /app/node_modules/GreenchClaw
ln -sfnT "$GreenchClaw_package_dir" /app/node_modules/GreenchClaw
rm -rf /app/dist
ln -sfnT "$GreenchClaw_package_dir/dist" /app/dist
cp "$GreenchClaw_package_dir/package.json" /app/package.json
node scripts/e2e/lib/npm-telegram-live/prepare-package.mjs \
  /app/package.json \
  /app/node_modules/GreenchClaw/package.json
for deps_dir in "$GreenchClaw_package_dir/node_modules" /npm-global/lib/node_modules; do
  [ -d "$deps_dir" ] || continue
  for dependency_dir in "$deps_dir"/*; do
    [ -e "$dependency_dir" ] || continue
    dependency_name="$(basename "$dependency_dir")"
    case "$dependency_name" in
      .bin | GreenchClaw)
        continue
        ;;
      @*)
        [ -d "$dependency_dir" ] || continue
        mkdir -p "/app/node_modules/$dependency_name"
        for scoped_dependency_dir in "$dependency_dir"/*; do
          [ -e "$scoped_dependency_dir" ] || continue
          scoped_dependency_name="$(basename "$scoped_dependency_dir")"
          rm -rf "/app/node_modules/$dependency_name/$scoped_dependency_name"
          ln -sfnT "$scoped_dependency_dir" "/app/node_modules/$dependency_name/$scoped_dependency_name"
        done
        ;;
      *)
        rm -rf "/app/node_modules/$dependency_name"
        ln -sfnT "$dependency_dir" "/app/node_modules/$dependency_name"
        ;;
    esac
  done
done

link_installed_package_dependency() {
  local name="$1"
  local source="/npm-global/lib/node_modules/GreenchClaw/node_modules/$name"
  local target="/app/node_modules/$name"
  if [ ! -e "$source" ]; then
    echo "Installed package dependency is missing: $name" >&2
    return 1
  fi
  mkdir -p "$(dirname "$target")"
  ln -sfn "$source" "$target"
}

# QA Lab is intentionally mounted as harness source, so its package-local
# runtime imports must resolve from the installed package dependency tree.
for dependency in \
  @modelcontextprotocol/sdk \
  yaml \
  zod; do
  link_installed_package_dependency "$dependency"
done

if [ "${GREENCHCLAW_NPM_TELEGRAM_SKIP_HOTPATH:-0}" != "1" ]; then
  echo "Running installed-package onboarding recovery hot path..."
  OPENAI_API_KEY="${OPENAI_API_KEY:-sk-GreenchClaw-npm-telegram-hotpath}" GreenchClaw onboard --non-interactive --accept-risk \
    --mode local \
    --auth-choice openai-api-key \
    --secret-input-mode ref \
    --gateway-port 18789 \
    --gateway-bind loopback \
    --skip-daemon \
    --skip-ui \
    --skip-skills \
    --skip-health \
    --json >/tmp/GreenchClaw-npm-telegram-onboard.json </dev/null

  GreenchClaw channels add --channel telegram --token "123456:GreenchClaw-npm-telegram-hotpath" >/tmp/GreenchClaw-npm-telegram-channel-add.log 2>&1 </dev/null
  GreenchClaw doctor --fix --non-interactive >/tmp/GreenchClaw-npm-telegram-doctor-fix.log 2>&1 </dev/null
  GreenchClaw doctor --non-interactive >/tmp/GreenchClaw-npm-telegram-doctor-check.log 2>&1 </dev/null
fi

export GREENCHCLAW_NPM_TELEGRAM_SUT_COMMAND="$(command -v GreenchClaw)"
trap - ERR
tsx scripts/e2e/npm-telegram-live-runner.ts
EOF

echo "package Telegram live Docker E2E passed ($PACKAGE_LABEL)"
