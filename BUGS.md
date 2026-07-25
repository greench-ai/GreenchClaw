# GreenchClaw Bug Tracker

## Active Issues

### BUG-001: Device pairing scopes don't survive gateway restart

**Severity:** High — breaks TUI/CLI after every restart
**Date found:** 2026-07-25
**Status:** FIX READY (manual workaround, needs code fix)

**Symptom:** After `GreenchClaw gateway restart`, TUI fails with:

```
agents list failed: GatewayClientRequestError: missing scope: operator.read
history failed: GatewayClientRequestError: missing scope: operator.read
sessions list failed: GatewayClientRequestError: missing scope: operator.read
send failed: GatewayClientRequestError: missing scope: operator.write
```

**Root cause:** When the gateway restarts, paired device tokens reconnect and request their full scope set. If the approved scopes in `devices/paired.json` are narrower than what the client requests, the gateway creates a pending scope upgrade request and blocks the connection. The `GreenchClaw devices approve` command needs `operator.admin` scope to approve — but the token itself is the one requesting the upgrade, creating a chicken-and-egg problem.

**Current workaround:** Edit `~/.GreenchClaw/devices/paired.json` directly to grant full operator scopes, clear `pending.json`, restart gateway.

**Proper fix needed:** Either:

1. Auto-approve scope upgrades for loopback connections (gateway.mode=local)
2. Store the full scope set in the paired device contract at initial pairing time
3. Allow the gateway auth token to approve scope upgrades for its own device

---

### BUG-002: Config file (GreenchClaw.json) instability

**Severity:** Medium — 5 backup copies created, suggests frequent rewrites
**Date found:** 2026-07-25
**Status:** INVESTIGATING

**Symptom:** `~/.GreenchClaw/GreenchClaw.json` has 5 `.bak` files, meaning the config is being rewritten frequently. Each rewrite risks corruption.

**Root cause:** Unknown — needs investigation of what's triggering config rewrites.

---

### BUG-003: Heartbeat cron too aggressive for steady state

**Severity:** Low — wasted compute cycles
**Date found:** 2026-07-25
**Status:** DESIGN

**Symptom:** Heartbeat runs every 15 minutes regardless of activity. On a quiet day, 96 heartbeats run, most logging "steady state, nothing happened."

**Proposed fix:** Adaptive heartbeat — 15min when active (recent comms/experiences), 1hr when quiet (3+ consecutive steady-state heartbeats).

## Resolved Issues

(none yet)
