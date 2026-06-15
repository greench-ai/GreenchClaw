---
summary: "Uninstall GreenchClaw completely (CLI, service, state, workspace)"
read_when:
  - You want to remove GreenchClaw from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

Two paths:

- **Easy path** if `GreenchClaw` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
GreenchClaw uninstall
```

Non-interactive (automation / npx):

```bash
GreenchClaw uninstall --all --yes --non-interactive
npx -y GreenchClaw uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
GreenchClaw gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
GreenchClaw gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${GREENCHCLAW_STATE_DIR:-$HOME/.GreenchClaw}"
```

If you set `GREENCHCLAW_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.GreenchClaw/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g GreenchClaw
pnpm remove -g GreenchClaw
bun remove -g GreenchClaw
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/GreenchClaw.app
```

Notes:

- If you used profiles (`--profile` / `GREENCHCLAW_PROFILE`), repeat step 3 for each state dir (defaults are `~/.GreenchClaw-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `GreenchClaw` is missing.

### macOS (launchd)

Default label is `ai.GreenchClaw.gateway` (or `ai.GreenchClaw.<profile>`; legacy `com.GreenchClaw.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.GreenchClaw.gateway
rm -f ~/Library/LaunchAgents/ai.GreenchClaw.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.GreenchClaw.<profile>`. Remove any legacy `com.GreenchClaw.*` plists if present.

### Linux (systemd user unit)

Default unit name is `GreenchClaw-gateway.service` (or `GreenchClaw-gateway-<profile>.service`):

```bash
systemctl --user disable --now GreenchClaw-gateway.service
rm -f ~/.config/systemd/user/GreenchClaw-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `GreenchClaw Gateway` (or `GreenchClaw Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "GreenchClaw Gateway"
Remove-Item -Force "$env:USERPROFILE\.GreenchClaw\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.GreenchClaw-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://GreenchClaw.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g GreenchClaw@latest`.
Remove it with `npm rm -g GreenchClaw` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `GreenchClaw ...` / `bun run GreenchClaw ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.

## Related

- [Install overview](/install)
- [Migration guide](/install/migrating)
