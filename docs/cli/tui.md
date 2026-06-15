---
summary: "CLI reference for `GreenchClaw tui` (Gateway-backed or local embedded terminal UI)"
read_when:
  - You want a terminal UI for the Gateway (remote-friendly)
  - You want to pass url/token/session from scripts
  - You want to run the TUI in local embedded mode without a Gateway
  - You want to use GreenchClaw chat or GreenchClaw tui --local
title: "TUI"
---

# `GreenchClaw tui`

Open the terminal UI connected to the Gateway, or run it in local embedded
mode.

Related:

- TUI guide: [TUI](/web/tui)

## Options

| Flag                  | Default                                   | Description                                                                        |
| --------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `--local`             | `false`                                   | Run against the local embedded agent runtime instead of a Gateway.                 |
| `--url <url>`         | `gateway.remote.url` from config          | Gateway WebSocket URL.                                                             |
| `--token <token>`     | (none)                                    | Gateway token if required.                                                         |
| `--password <pass>`   | (none)                                    | Gateway password if required.                                                      |
| `--session <key>`     | `main` (or `global` when scope is global) | Session key. Inside an agent workspace it auto-selects that agent unless prefixed. |
| `--deliver`           | `false`                                   | Deliver assistant replies through configured channels.                             |
| `--thinking <level>`  | (model default)                           | Thinking level override.                                                           |
| `--message <text>`    | (none)                                    | Send an initial message after connecting.                                          |
| `--timeout-ms <ms>`   | `agents.defaults.timeoutSeconds`          | Agent timeout. Invalid values log a warning and are ignored.                       |
| `--history-limit <n>` | `200`                                     | History entries to load on attach.                                                 |

Aliases: `GreenchClaw chat` and `GreenchClaw terminal` invoke the same command with `--local` implied.

Notes:

- `chat` and `terminal` are aliases for `GreenchClaw tui --local`.
- `--local` cannot be combined with `--url`, `--token`, or `--password`.
- `tui` resolves configured gateway auth SecretRefs for token/password auth when possible (`env`/`file`/`exec` providers).
- When launched from inside a configured agent workspace directory, TUI auto-selects that agent for the session key default (unless `--session` is explicitly `agent:<id>:...`).
- Local mode uses the embedded agent runtime directly. Most local tools work, but Gateway-only features are unavailable.
- Local mode adds `/auth [provider]` inside the TUI command surface.
- Plugin approval gates still apply in local mode. Tools that require approval prompt for a decision in the terminal; nothing is silently auto-approved because the Gateway is not involved.

## Examples

```bash
GreenchClaw chat
GreenchClaw tui --local
GreenchClaw tui
GreenchClaw tui --url ws://127.0.0.1:18789 --token <token>
GreenchClaw tui --session main --deliver
GreenchClaw chat --message "Compare my config to the docs and tell me what to fix"
# when run inside an agent workspace, infers that agent automatically
GreenchClaw tui --session bugfix
```

## Config repair loop

Use local mode when the current config already validates and you want the
embedded agent to inspect it, compare it against the docs, and help repair it
from the same terminal:

If `GreenchClaw config validate` is already failing, use `GreenchClaw configure` or
`GreenchClaw doctor --fix` first. `GreenchClaw chat` does not bypass the invalid-
config guard.

```bash
GreenchClaw chat
```

Then inside the TUI:

```text
!GreenchClaw config file
!GreenchClaw docs gateway auth token secretref
!GreenchClaw config validate
!GreenchClaw doctor
```

Apply targeted fixes with `GreenchClaw config set` or `GreenchClaw configure`, then
rerun `GreenchClaw config validate`. See [TUI](/web/tui) and [Config](/cli/config).

## Related

- [CLI reference](/cli)
- [TUI](/web/tui)
