#!/usr/bin/env bash
# ============================================================
# GreenchClaw — One-shot installer — GreenchClaw
# Usage: bash install.sh
# ============================================================

# Don't use set -e — commands fail gracefully and we handle exit codes
# set -e removed: sudo without password in piped install fails silently instead of aborting

REPO="https://github.com/greench-ai/GreenchClaw.git"
INSTALL_DIR="$HOME/GreenchClaw"
BIN_DIR="$HOME/bin"
CONFIG_DIR="$HOME/.GreenchClaw"
GATEWAY_PORT=18420

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}▸${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}!${NC} $1"; }
error()   { echo -e "${RED}✗ ERROR:${NC} $1"; exit 1; }
header()  { echo -e "\n${BOLD}$1${NC}"; echo "────────────────────────────────────────"; }
optional(){ echo -e "  ${YELLOW}○${NC} $1 ${YELLOW}(optional)${NC}"; }

# ── Detect OS ────────────────────────────────────────────────
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_FAMILY="linux"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    OS_FAMILY="macos"
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    OS="wsl"
    OS_FAMILY="linux"
  else
    OS="unknown"
    OS_FAMILY="unknown"
  fi
}

# ── Install system packages ───────────────────────────────────
install_system_deps() {
  header "System Dependencies"

  detect_os

  if [ "$OS_FAMILY" = "linux" ]; then
    PKG_MANAGER=""
    if command -v apt-get &>/dev/null; then PKG_MANAGER="apt";
    elif command -v dnf &>/dev/null;     then PKG_MANAGER="dnf";
    elif command -v yum &>/dev/null;     then PKG_MANAGER="yum";
    elif command -v pacman &>/dev/null;  then PKG_MANAGER="pacman";
    fi

    # Core build tools (required)
    CORE_PKGS="curl git build-essential python3"

    # Install based on package manager
    if [ "$PKG_MANAGER" = "apt" ]; then
      # Check if sudo works first
      if ! sudo -n true 2>/dev/null; then
        warn "sudo password required but not available in this shell"
        warn "System deps may need manual install: $CORE_PKGS"
        warn "Try running in a real terminal, or install deps manually before re-running"
      else
        info "Installing core packages: $CORE_PKGS"
        sudo apt-get install -y -qq curl git build-essential python3 python3-pip ca-certificates
      fi
    elif [ "$PKG_MANAGER" = "dnf" ] || [ "$PKG_MANAGER" = "yum" ]; then
      sudo $PKG_MANAGER install -y curl git gcc gcc-c++ make python3 python3-pip ca-certificates
    elif [ "$PKG_MANAGER" = "pacman" ]; then
      sudo pacman -Sy --noconfirm curl git base-devel python python-pip ca-certificates
    else
      warn "Unknown package manager — skipping system package install"
      warn "Make sure these are installed: curl git build-essential python3"
    fi
    success "Core system packages installed"

    # Node.js 22 (if missing or wrong version)
    if ! command -v node &>/dev/null || [ "$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')" -lt 22 ]; then
      info "Installing Node.js 22..."
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - 2>/dev/null
      sudo apt-get install -y nodejs 2>/dev/null || \
      sudo dnf install -y nodejs 2>/dev/null || \
      warn "Could not auto-install Node.js — please install manually: https://nodejs.org"
    fi

  elif [ "$OS_FAMILY" = "macos" ]; then
    if ! command -v brew &>/dev/null; then
      info "Installing Homebrew..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    info "Installing core packages..."
    brew install git curl python3 2>/dev/null || true
    success "Core system packages installed"

    if ! command -v node &>/dev/null || [ "$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')" -lt 22 ]; then
      info "Installing Node.js 22..."
      brew install node@22
    fi
  fi

  # Optional system tools (features degrade gracefully without them)
  echo ""
  info "Checking optional system tools..."
  MISSING_OPTIONAL=()

  command -v python3  &>/dev/null && success "python3 (agent code execution)" || { MISSING_OPTIONAL+=("python3"); optional "python3 — needed for agent Python code execution"; }
  command -v ffmpeg   &>/dev/null && success "ffmpeg (voice/media)" || { MISSING_OPTIONAL+=("ffmpeg"); optional "ffmpeg — needed for voice messages and media processing"; }
  command -v curl     &>/dev/null && success "curl (web requests)" || { MISSING_OPTIONAL+=("curl"); optional "curl — needed for web fetch tools"; }

  if [ ${#MISSING_OPTIONAL[@]} -gt 0 ]; then
    echo ""
    warn "Optional tools missing: ${MISSING_OPTIONAL[*]}"
    if [ "$OS_FAMILY" = "linux" ] && [ "$PKG_MANAGER" = "apt" ]; then
      if [ "$AUTO_YES" = 1 ] || [ ! -t 0 ]; then
        sudo apt-get install -y ffmpeg python3 2>/dev/null || true
        success "Optional tools installed"
      else
        read -rp "  Install optional tools now? [y/N]: " INSTALL_OPT
        if [[ "$INSTALL_OPT" =~ ^[Yy]$ ]]; then
          sudo apt-get install -y ffmpeg python3 2>/dev/null || true
          success "Optional tools installed"
        fi
      fi
    fi
  fi
}

# ── Verify core requirements ──────────────────────────────────
verify_requirements() {
  header "Verifying Requirements"

  # Node.js
  if ! command -v node &>/dev/null; then
    error "Node.js not found.\n  Install: https://nodejs.org (v22+)"
  fi
  NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 22 ]; then
    error "Node.js 22+ required (found $NODE_VER)\n  Upgrade: https://nodejs.org"
  fi
  success "Node.js $NODE_VER"

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    info "Installing pnpm..."
    npm install -g pnpm
  fi
  success "pnpm $(pnpm --version)"

  # git
  if ! command -v git &>/dev/null; then
    error "Git not found.\n  Install: sudo apt-get install git"
  fi
  success "git $(git --version | cut -d' ' -f3)"

  # curl
  if ! command -v curl &>/dev/null; then
    error "curl not found.\n  Install: sudo apt-get install curl"
  fi
  success "curl $(curl --version | head -1 | cut -d' ' -f2)"
}

# ── Clone or update ───────────────────────────────────────────
setup_repo() {
  header "Repository"

  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Updating existing repo at $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git pull --ff-only
    success "Repo updated"
  else
    info "Cloning to $INSTALL_DIR..."
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    success "Repo cloned"
  fi
}

# ── Install npm deps ──────────────────────────────────────────
install_deps() {
  header "Node Dependencies"

  cd "$INSTALL_DIR"
  info "Installing packages (this may take a minute)..."
  if ! pnpm install --no-frozen-lockfile 2>&1; then
    error "pnpm install failed"
    exit 1
  fi
  success "Node dependencies installed"
}

# ── Build ─────────────────────────────────────────────────────
build() {
  header "Build"

  cd "$INSTALL_DIR"

  info "Building gateway..."
  pnpm build
  success "Gateway built"

  info "Building UI..."
  pnpm ui:build 2>/dev/null
  success "UI built"

  # openclaw compat symlink (extensions import from openclaw/plugin-sdk/...)
  ln -sf "$INSTALL_DIR" "$INSTALL_DIR/node_modules/openclaw" 2>/dev/null || true
  success "openclaw compatibility symlink set"
}

# ── Binary ────────────────────────────────────────────────────
install_binary() {
  header "Binary"

  mkdir -p "$BIN_DIR"

  cat > "$BIN_DIR/GreenchClaw" << EOF
#!/bin/bash
exec node $INSTALL_DIR/GreenchClaw.mjs "\$@"
EOF
  chmod +x "$BIN_DIR/GreenchClaw"
  success "Binary installed at $BIN_DIR/GreenchClaw"

  # PATH
  if ! grep -q '"$HOME/bin"' "$HOME/.bashrc" 2>/dev/null && \
     ! grep -q '$HOME/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.bashrc"
    info "Added ~/bin to PATH in ~/.bashrc"
  fi

  # Remove any conflicting alias
  if grep -q 'alias GreenchClaw=' "$HOME/.bashrc" 2>/dev/null; then
    sed -i '/alias GreenchClaw=/d' "$HOME/.bashrc"
    warn "Removed old GreenchClaw alias from ~/.bashrc"
  fi

  export PATH="$BIN_DIR:$PATH"
}

# ── Config ────────────────────────────────────────────────────
setup_config() {
  header "Config"

  mkdir -p "$CONFIG_DIR/workspace/skills"
  mkdir -p "$INSTALL_DIR/library"

  if [ ! -f "$CONFIG_DIR/GreenchClaw.json" ]; then
    cat > "$CONFIG_DIR/GreenchClaw.json" << EOF
{
  "gateway": {
    "port": $GATEWAY_PORT,
    "bind": "loopback",
    "mode": "local"
  },
  "agents": {
    "defaults": {
      "sandbox": { "mode": "off" },
      "model": {
        "primary": "anthropic/claude-opus-4-6",
        "fallbacks": []
      }
    }
  }
}
EOF
    success "Config created at $CONFIG_DIR/GreenchClaw.json"
  else
    success "Config already exists — skipped"
  fi

  # Skills
  if [ -d "$INSTALL_DIR/skills" ]; then
    cp -r "$INSTALL_DIR/skills/"* "$CONFIG_DIR/workspace/skills/" 2>/dev/null || true
    SKILL_COUNT=$(ls "$CONFIG_DIR/workspace/skills/" | wc -l)
    success "Skills installed ($SKILL_COUNT): $(ls $CONFIG_DIR/workspace/skills/ | tr '\n' ' ')"
  fi

  # Additional clawhub skills (auto-installed on every setup)
  header "Installing Additional Skills"
  for skill in arc-security-mcp academic-research claw-smart-context; do
    if command -v clawhub &>/dev/null; then
      info "Installing $skill..."
      clawhub install "$skill" --force 2>/dev/null && success "$skill installed" || warn "$skill failed (non-fatal)"
    else
      warn "clawhub not found — skipping $skill (install it manually)"
    fi
  done
}

# ── API Key ───────────────────────────────────────────────────
setup_api_key() {
  header "API Key"

  # Env var takes priority (set by --api-key=... in main)
  if [ -n "$ANTHROPIC_API_KEY" ]; then
    success "ANTHROPIC_API_KEY already set"
    return
  fi

  echo ""
  echo -e "  ${BOLD}Anthropic API key${NC} required to run the AI agent."
  echo -e "  Get one at: ${BLUE}https://console.anthropic.com${NC}"
  echo -e "  Leave blank to skip (configure later: GreenchClaw secrets configure)"
  echo ""
  read -rsp "  Paste API key (hidden): " API_KEY
  echo ""

  if [ -n "$API_KEY" ]; then
    # Try systemd first, fall back to .bashrc
    if systemctl --user set-environment ANTHROPIC_API_KEY="$API_KEY" 2>/dev/null; then
      success "API key saved to systemd user environment"
    else
      echo "export ANTHROPIC_API_KEY='$API_KEY'" >> "$HOME/.bashrc"
      success "API key saved to ~/.bashrc"
    fi
  else
    warn "Skipped — run 'GreenchClaw secrets configure' later"
  fi
}

# ── Gateway service ───────────────────────────────────────────
setup_service() {
  header "Gateway Service"

  "$BIN_DIR/GreenchClaw" gateway install 2>/dev/null || true

  if command -v systemctl &>/dev/null; then
    systemctl --user daemon-reload 2>/dev/null || true
    # Enable lingering so service survives logout (useful for VPS/Pi)
    loginctl enable-linger "$USER" 2>/dev/null || true
    systemctl --user enable GreenchClaw-gateway.service 2>/dev/null || true
    systemctl --user start GreenchClaw-gateway.service 2>/dev/null || true
    sleep 2

    if systemctl --user is-active GreenchClaw-gateway.service &>/dev/null; then
      success "Gateway running on port $GATEWAY_PORT (systemd service)"
    else
      warn "Service not active — try: GreenchClaw gateway start"
    fi
  else
    warn "systemd not available — start manually: GreenchClaw gateway"
  fi
}

# ── Cron jobs ─────────────────────────────────────────────────
setup_cron() {
  header "Cron Jobs"

  count=$("$BIN_DIR/GreenchClaw" cron list 2>/dev/null | grep -cE "evoclaw|memory-save|library-update" 2>/dev/null || echo 0)
EXISTING=${count//[^0-9]/}

  if [ "${EXISTING:-0}" -ge 3 ]; then
    success "Cron jobs already configured — skipped"
    return
  fi

  "$BIN_DIR/GreenchClaw" cron add --name "evoclaw-heartbeat" \
    --cron "*/15 * * * *" --session isolated \
    --message "Run skill: evoclaw/heartbeat" 2>/dev/null \
    && success "Cron: evoclaw-heartbeat (every 15 min)" \
    || warn "Could not add evoclaw-heartbeat (add manually after gateway starts)"

  "$BIN_DIR/GreenchClaw" cron add --name "memory-save" \
    --cron "*/30 * * * *" --session isolated \
    --message "Run skill: memory-save/run" 2>/dev/null \
    && success "Cron: memory-save (every 30 min)" \
    || warn "Could not add memory-save"

  "$BIN_DIR/GreenchClaw" cron add --name "library-update" \
    --cron "0 * * * *" --session isolated \
    --message "Run skill: library-update/run" 2>/dev/null \
    && success "Cron: library-update (every hour)" \
    || warn "Could not add library-update"
}

# ── Summary ───────────────────────────────────────────────────
print_summary() {
  header "Installation Complete"

  echo ""
  echo -e "  ${GREEN}${BOLD}GreenchClaw is ready!${NC}"
  echo ""
  echo -e "  ${BOLD}Version:${NC}  $("$BIN_DIR/GreenchClaw" --version 2>/dev/null || echo 'GreenchClaw 1.0.0')"
  echo -e "  ${BOLD}Gateway:${NC}  http://localhost:$GATEWAY_PORT"
  echo -e "  ${BOLD}Config:${NC}   $CONFIG_DIR/GreenchClaw.json"
  echo -e "  ${BOLD}Skills:${NC}   $(ls $CONFIG_DIR/workspace/skills/ 2>/dev/null | wc -l | tr -d ' ') installed"
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo -e "  1. Reload shell:       ${BLUE}source ~/.bashrc${NC}"
  echo -e "  2. Open dashboard:     ${BLUE}GreenchClaw dashboard${NC}"
  echo -e "  3. Run onboarding:     ${BLUE}GreenchClaw onboard${NC}"
  echo ""
  echo -e "  ${BOLD}Useful commands:${NC}"
  echo -e "  ${BLUE}GreenchClaw gateway status${NC}      — check gateway"
  echo -e "  ${BLUE}GreenchClaw secrets configure${NC}   — set API keys"
  echo -e "  ${BLUE}GreenchClaw models${NC}              — configure models (Ollama etc)"
  echo -e "  ${BLUE}GreenchClaw doctor --fix${NC}        — fix config issues"
  echo ""
  echo -e "  ${BOLD}Docs:${NC}"
  echo -e "  $INSTALL_DIR/docs/install.md"
  echo -e "  $INSTALL_DIR/docs/deploy.md"
  echo ""
}

# ── Main ──────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}  ⚔  GreenchClaw Installer${NC}"
  echo ""

  # Non-interactive flags
  AUTO_YES=0
  SKIP_API_KEY=0
  RUN_ONBOARD=1
  for arg in "$@"; do
    case "$arg" in
      --yes|-y)          AUTO_YES=1 ;;
      --api-key=*)       API_KEY="${arg#*=}" ;;
      --skip-api-key)    SKIP_API_KEY=1 ;;
      --no-onboard)      RUN_ONBOARD=0 ;;
    esac
  done

  # Auto-yes: approve system deps + optional tools silently
  if [ "$AUTO_YES" = 1 ] || [ ! -t 0 ]; then
    export INSTALL_OPT=y AUTO_YES=$AUTO_YES
    install_system_deps
  else
    read -rp "  Install/verify system dependencies (requires sudo)? [Y/n]: " INSTALL_SYS
    if [[ ! "$INSTALL_SYS" =~ ^[Nn]$ ]]; then
      install_system_deps
    fi
  fi

  verify_requirements
  setup_repo
  install_deps
  build
  install_binary
  setup_config
  setup_service
  setup_cron
  print_summary

  # Onboard requires a real TTY — pipe/SSH without -t doesn't have one
  # Detect TTY and act accordingly
  echo ""
  if [ -t 0 ] && [ -t 1 ]; then
    # Real TTY — safe to run onboard interactively
    info "Launching GreenchClaw onboarding..."
    echo ""
    cd "$INSTALL_DIR"
    exec "$BIN_DIR/GreenchClaw" onboard
  else
    # No TTY (piped or SSH without -t) — install is done, onboard needs a real terminal
    echo ""
    echo -e "  ${BOLD}Installation complete!${NC}"
    echo ""
    echo -e "  ${YELLOW}⚠️  Onboarding requires a real terminal.${NC}"
    echo ""
    echo -e "  Reconnect with SSH -t to continue:"
    echo -e "    ${BLUE}ssh -t $USER@$(hostname) 'source ~/.bashrc && GreenchClaw onboard'${NC}"
    echo ""
    echo -e "  Or open a second terminal on this machine and run:"
    echo -e "    ${BLUE}source ~/.bashrc && GreenchClaw onboard${NC}"
    echo ""
  fi
}

main "$@"
