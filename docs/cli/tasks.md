---
summary: "CLI reference for `GreenchClaw tasks` (background task ledger and Task Flow state)"
read_when:
  - You want to inspect, audit, or cancel background task records
  - You are documenting Task Flow commands under `GreenchClaw tasks flow`
title: "`GreenchClaw tasks`"
---

Inspect durable background tasks and Task Flow state. With no subcommand,
`GreenchClaw tasks` is equivalent to `GreenchClaw tasks list`.

See [Background Tasks](/automation/tasks) for the lifecycle and delivery model.

## Usage

```bash
GreenchClaw tasks
GreenchClaw tasks list
GreenchClaw tasks list --runtime acp
GreenchClaw tasks list --status running
GreenchClaw tasks show <lookup>
GreenchClaw tasks notify <lookup> state_changes
GreenchClaw tasks cancel <lookup>
GreenchClaw tasks audit
GreenchClaw tasks maintenance
GreenchClaw tasks maintenance --apply
GreenchClaw tasks flow list
GreenchClaw tasks flow show <lookup>
GreenchClaw tasks flow cancel <lookup>
```

## Root Options

- `--json`: output JSON.
- `--runtime <name>`: filter by kind: `subagent`, `acp`, `cron`, or `cli`.
- `--status <name>`: filter by status: `queued`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`, or `lost`.

## Subcommands

### `list`

```bash
GreenchClaw tasks list [--runtime <name>] [--status <name>] [--json]
```

Lists tracked background tasks newest first.

### `show`

```bash
GreenchClaw tasks show <lookup> [--json]
```

Shows one task by task ID, run ID, or session key.

### `notify`

```bash
GreenchClaw tasks notify <lookup> <done_only|state_changes|silent>
```

Changes the notification policy for a running task.

### `cancel`

```bash
GreenchClaw tasks cancel <lookup>
```

Cancels a running background task.

### `audit`

```bash
GreenchClaw tasks audit [--severity <warn|error>] [--code <name>] [--limit <n>] [--json]
```

Surfaces stale, lost, delivery-failed, or otherwise inconsistent task and Task Flow records. Lost tasks retained until `cleanupAfter` are warnings; expired or unstamped lost tasks are errors.

### `maintenance`

```bash
GreenchClaw tasks maintenance [--apply] [--json]
```

Previews or applies task and Task Flow reconciliation, cleanup stamping, pruning,
and stale cron run session registry cleanup.
For cron tasks, reconciliation uses persisted run logs/job state before marking an
old active task `lost`, so completed cron runs do not become false audit errors
just because the in-memory Gateway runtime state is gone. Offline CLI audit is
not authoritative for the Gateway's process-local cron active-job set. CLI tasks
with a run id/source id are marked `lost` when their live Gateway run context is
gone, even if an old child-session row remains.
When applied, maintenance also prunes `cron:<jobId>:run:<uuid>` session registry
rows older than 7 days while preserving currently running cron jobs and leaving
non-cron session rows untouched.

### `flow`

```bash
GreenchClaw tasks flow list [--status <name>] [--json]
GreenchClaw tasks flow show <lookup> [--json]
GreenchClaw tasks flow cancel <lookup>
```

Inspects or cancels durable Task Flow state under the task ledger.

## Related

- [CLI reference](/cli)
- [Background tasks](/automation/tasks)
