# ClawDock <!-- omit in toc -->

Stop typing `docker-compose` commands. Just type `clawdock-start`.

Inspired by Simon Willison's [Running GreenchClaw in Docker](https://til.simonwillison.net/llms/GreenchClaw-docker).

- [Quickstart](#quickstart)
- [Available Commands](#available-commands)
  - [Basic Operations](#basic-operations)
  - [Container Access](#container-access)
  - [Web UI \& Devices](#web-ui--devices)
  - [Setup \& Configuration](#setup--configuration)
  - [Maintenance](#maintenance)
  - [Utilities](#utilities)
- [Configuration \& Secrets](#configuration--secrets)
  - [Docker Files](#docker-files)
  - [Config Files](#config-files)
  - [Initial Setup](#initial-setup)
  - [How It Works in Docker](#how-it-works-in-docker)
  - [Env Precedence](#env-precedence)
- [Common Workflows](#common-workflows)
  - [Check Status and Logs](#check-status-and-logs)
  - [Set Up WhatsApp Bot](#set-up-whatsapp-bot)
  - [Troubleshooting Device Pairing](#troubleshooting-device-pairing)
  - [Fix Token Mismatch Issues](#fix-token-mismatch-issues)
  - [Permission Denied](#permission-denied)
- [Requirements](#requirements)
- [Development](#development)

## Quickstart

**Install:**

```bash
mkdir -p ~/.clawdock && curl -sL https://raw.githubusercontent.com/GreenchClaw/GreenchClaw/main/scripts/clawdock/clawdock-helpers.sh -o ~/.clawdock/clawdock-helpers.sh
```

```bash
echo 'source ~/.clawdock/clawdock-helpers.sh' >> ~/.zshrc && source ~/.zshrc
```

Canonical docs page: https://docs.GreenchClaw.ai/install/clawdock

If you previously installed ClawDock from `scripts/shell-helpers/clawdock-helpers.sh`, rerun the install command above. The old raw GitHub path has been removed.

**See what you get:**

```bash
clawdock-help
```

On first command, ClawDock auto-detects your GreenchClaw directory:

- Checks common paths (`~/GreenchClaw`, `~/workspace/GreenchClaw`, etc.)
- If found, asks you to confirm
- Saves to `~/.clawdock/config`

**First time setup:**

```bash
clawdock-start
```

```bash
clawdock-fix-token
```

```bash
clawdock-dashboard
```

If you see "pairing required":

```bash
clawdock-devices
```

And approve the request for the specific device:

```bash
clawdock-approve <request-id>
```

## Available Commands

### Basic Operations

| Command            | Description                     |
| ------------------ | ------------------------------- |
| `clawdock-start`   | Start the gateway               |
| `clawdock-stop`    | Stop the gateway                |
| `clawdock-restart` | Restart the gateway             |
| `clawdock-status`  | Check container status          |
| `clawdock-logs`    | View live logs (follows output) |

### Container Access

| Command                   | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `clawdock-shell`          | Interactive shell inside the gateway container |
| `clawdock-cli <command>`  | Run GreenchClaw CLI commands                   |
| `clawdock-exec <command>` | Execute arbitrary commands in the container    |

### Web UI & Devices

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `clawdock-dashboard`    | Open web UI in browser with authentication |
| `clawdock-devices`      | List device pairing requests               |
| `clawdock-approve <id>` | Approve a device pairing request           |

### Setup & Configuration

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `clawdock-fix-token` | Configure gateway authentication token (run once) |

### Maintenance

| Command            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `clawdock-update`  | Pull latest, rebuild image, and restart (one command) |
| `clawdock-rebuild` | Rebuild the Docker image only                         |
| `clawdock-clean`   | Remove all containers and volumes (destructive!)      |

### Utilities

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| `clawdock-health`      | Run gateway health check                  |
| `clawdock-token`       | Display the gateway authentication token  |
| `clawdock-cd`          | Jump to the GreenchClaw project directory |
| `clawdock-config`      | Open the GreenchClaw config directory     |
| `clawdock-show-config` | Print config files with redacted values   |
| `clawdock-workspace`   | Open the workspace directory              |
| `clawdock-help`        | Show all available commands with examples |

## Configuration & Secrets

The Docker setup uses three config files on the host. The container never stores secrets — everything is bind-mounted from local files.

### Docker Files

| File                       | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `Dockerfile`               | Builds the `GreenchClaw:local` image (Node 22, pnpm, non-root `node` user)       |
| `docker-compose.yml`       | Defines `GreenchClaw-gateway` and `GreenchClaw-cli` services, bind-mounts, ports |
| `scripts/docker/setup.sh`  | First-time setup — builds image, creates `.env` from `.env.example`              |
| `.env.example`             | Template for `<project>/.env` with all supported vars and docs                   |
| `docker-compose.extra.yml` | Optional overrides — auto-loaded by ClawDock helpers if present                  |

### Config Files

| File                              | Purpose                                          | Examples                                                                                                            |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `<project>/.env`                  | **Docker infra** — image, ports, gateway token   | `GREENCHCLAW_GATEWAY_TOKEN`, `GREENCHCLAW_IMAGE`, `GREENCHCLAW_GATEWAY_PORT`, `GREENCHCLAW_AUTH_PROFILE_SECRET_DIR` |
| `~/.GreenchClaw/.env`             | **Secrets** — API keys and bot tokens            | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`                                                         |
| `~/.GreenchClaw/GreenchClaw.json` | **Behavior config** — models, channels, policies | Model selection, WhatsApp allowlists, agent settings                                                                |

**Do NOT** put API keys or bot tokens in `GreenchClaw.json`. Use `~/.GreenchClaw/.env` for all secrets.

### Initial Setup

`./scripts/docker/setup.sh` handles first-time Docker configuration:

- Builds the `GreenchClaw:local` image from `Dockerfile`
- Creates `<project>/.env` from `.env.example` with a generated gateway token
- Creates the auth-profile secret key directory
- Sets up `~/.GreenchClaw` directories if they don't exist

```bash
./scripts/docker/setup.sh
```

After setup, add your API keys:

```bash
vim ~/.GreenchClaw/.env
```

See `.env.example` for all supported keys.

The `Dockerfile` supports two optional build args:

- `GREENCHCLAW_DOCKER_APT_PACKAGES` — extra apt packages to install (e.g. `ffmpeg`)
- `GREENCHCLAW_INSTALL_BROWSER=1` — pre-install Chromium for browser automation (adds ~300MB, but skips the 60-90s Playwright install on each container start)

### How It Works in Docker

`docker-compose.yml` bind-mounts both config and workspace from the host:

```yaml
volumes:
  - ${GREENCHCLAW_CONFIG_DIR}:/home/node/.GreenchClaw
  - ${GREENCHCLAW_WORKSPACE_DIR}:/home/node/.GreenchClaw/workspace
  - ${GREENCHCLAW_AUTH_PROFILE_SECRET_DIR}:/home/node/.config/GreenchClaw
```

This means:

- `~/.GreenchClaw/.env` is available inside the container at `/home/node/.GreenchClaw/.env` — GreenchClaw loads it automatically as the global env fallback
- `~/.GreenchClaw/GreenchClaw.json` is available at `/home/node/.GreenchClaw/GreenchClaw.json` — the gateway watches it and hot-reloads most changes
- `~/.GreenchClaw-auth-profile-secrets` is available at `/home/node/.config/GreenchClaw` — GreenchClaw stores the auth-profile encryption key there
- Downloadable plugin packages and install records live under the mounted GreenchClaw home
- No need to add API keys to `docker-compose.yml` or configure anything inside the container
- Keys survive `clawdock-update`, `clawdock-rebuild`, and `clawdock-clean` because they live on the host

The project `.env` feeds Docker Compose directly (gateway token, image name, ports). The `~/.GreenchClaw/.env` feeds the GreenchClaw process inside the container.

### Example `~/.GreenchClaw/.env`

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
```

### Example `<project>/.env`

```bash
GREENCHCLAW_CONFIG_DIR=/Users/you/.GreenchClaw
GREENCHCLAW_WORKSPACE_DIR=/Users/you/.GreenchClaw/workspace
GREENCHCLAW_GATEWAY_PORT=18420
GREENCHCLAW_BRIDGE_PORT=18790
GREENCHCLAW_GATEWAY_BIND=lan
GREENCHCLAW_GATEWAY_TOKEN=<generated-by-docker-setup>
GREENCHCLAW_AUTH_PROFILE_SECRET_DIR=/Users/you/.GreenchClaw-auth-profile-secrets
GREENCHCLAW_IMAGE=GreenchClaw:local
```

### Env Precedence

GreenchClaw loads env vars in this order (highest wins, never overrides existing):

1. **Process environment** — `docker-compose.yml` `environment:` block (gateway token, session keys)
2. **`.env` in CWD** — project root `.env` (Docker infra vars)
3. **`~/.GreenchClaw/.env`** — global secrets (API keys, bot tokens)
4. **`GreenchClaw.json` `env` block** — inline vars, applied only if still missing
5. **Shell env import** — optional login-shell scrape (`GREENCHCLAW_LOAD_SHELL_ENV=1`)

## Common Workflows

### Update GreenchClaw

> **Important:** `GreenchClaw update` does not work inside Docker.
> The container runs as a non-root user with a source-built image, so `npm i -g` fails with EACCES.
> Use `clawdock-update` instead — it pulls, rebuilds, and restarts from the host.

```bash
clawdock-update
```

This runs `git pull` → `docker compose build` → `docker compose down/up` in one step.

If you only want to rebuild without pulling:

```bash
clawdock-rebuild && clawdock-stop && clawdock-start
```

### Check Status and Logs

**Restart the gateway:**

```bash
clawdock-restart
```

**Check container status:**

```bash
clawdock-status
```

**View live logs:**

```bash
clawdock-logs
```

### Set Up WhatsApp Bot

**Shell into the container:**

```bash
clawdock-shell
```

**Inside the container, login to WhatsApp:**

```bash
GreenchClaw channels login --channel whatsapp --verbose
```

Scan the QR code with WhatsApp on your phone.

**Verify connection:**

```bash
GreenchClaw status
```

### Troubleshooting Device Pairing

**Check for pending pairing requests:**

```bash
clawdock-devices
```

**Copy the Request ID from the "Pending" table, then approve:**

```bash
clawdock-approve <request-id>
```

Then refresh your browser.

### Fix Token Mismatch Issues

If you see "gateway token mismatch" errors:

```bash
clawdock-fix-token
```

This will:

1. Read the token from your `.env` file
2. Configure it in the GreenchClaw config
3. Restart the gateway
4. Verify the configuration

### Permission Denied

**Ensure Docker is running and you have permission:**

```bash
docker ps
```

## Requirements

- Docker and Docker Compose installed
- Bash or Zsh shell
- GreenchClaw project (run `scripts/docker/setup.sh`)

## Development

**Test with fresh config (mimics first-time install):**

```bash
unset CLAWDOCK_DIR && rm -f ~/.clawdock/config && source scripts/clawdock/clawdock-helpers.sh
```

Then run any command to trigger auto-detect:

```bash
clawdock-start
```
