# GreenchClaw Bug Tracker

## Active Issues

### BUG-001: Device pairing scopes don't survive gateway restart

**Severity:** High — breaks TUI/CLI after every restart
**Date found:** 2026-07-25
**Status:** ✅ FIXED — commit a40430be, pushed to origin/main

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

### BUG-002: Config file (GreenchClaw.json) backup rotation (NOT A BUG)

**Severity:** N/A — working as designed
**Date found:** 2026-07-25
**Status:** ✅ RESOLVED — not a bug, working as designed

**Finding:** `CONFIG_BACKUP_COUNT = 5` in `src/config/backup-rotation.ts` creates a 5-slot rotation ring: `.bak` (newest) → `.bak.1` → `.bak.2` → `.bak.3` → `.bak.4` (oldest). On every config write, the ring rotates (oldest deleted, rest shift down, new `.bak` created). This is a safety feature, not instability. The rotation also includes permission hardening (chmod 0o600) and orphan cleanup.

---

### BUG-003: Heartbeat cron too aggressive for steady state

**Severity:** Low — wasted compute cycles
**Date found:** 2026-07-25
**Status:** ✅ FIXED — disabled stale jobs, RSS delivery fixed

**Changes:**

1. Disabled Canna v5 Training Monitor (67 consecutive errors, pod stopped)
2. Disabled Canna v5 completion watcher (training complete)
3. Fixed RSS Feed Poll delivery (120 errors from announce→none)
4. Heartbeat stays at 15min — after cleanup, only 3 active cron jobs remain (heartbeat, network monitor, RSS poll)

**Rationale:** The 15-min heartbeat is the EvoClaw heartbeat. Slowing it down risks missing time-sensitive comms. After disabling 2 stale jobs and fixing RSS delivery, the cron load is reasonable.

## Resolved Issues

### BUG-001: Device pairing scopes don't survive gateway restart

**Resolved:** 2026-07-25 — commit a40430be
**Fix:** Changed `message-handler.ts` to allow `allowSilentLocalPairing` for scope-upgrade on local connections

### BUG-002: Config file backup rotation (NOT A BUG)

**Resolved:** 2026-07-25 — working as designed
**Finding:** `CONFIG_BACKUP_COUNT = 5` in `backup-rotation.ts` is a safety feature, not instability

### BUG-003: Stale cron jobs wasting resources

**Resolved:** 2026-07-25
**Fix:** Disabled 2 stale Canna v5 jobs (67+120 consecutive errors), fixed RSS delivery mode
