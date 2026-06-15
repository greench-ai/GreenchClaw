---
summary: "CLI reference for `GreenchClaw hooks` (agent hooks)"
read_when:
  - You want to manage agent hooks
  - You want to inspect hook availability or enable workspace hooks
title: "Hooks"
---

# `GreenchClaw hooks`

Manage agent hooks (event-driven automations for commands like `/new`, `/reset`, and gateway startup).

Running `GreenchClaw hooks` with no subcommand is equivalent to `GreenchClaw hooks list`.

Related:

- Hooks: [Hooks](/automation/hooks)
- Plugin hooks: [Plugin hooks](/plugins/hooks)

## List all hooks

```bash
GreenchClaw hooks list
```

List all discovered hooks from workspace, managed, extra, and bundled directories.
Gateway startup does not load internal hook handlers until at least one internal hook is configured.

**Options:**

- `--eligible`: Show only eligible hooks (requirements met)
- `--json`: Output as JSON
- `-v, --verbose`: Show detailed information including missing requirements

**Example output:**

```
Hooks (4/4 ready)

Ready:
  🚀 boot-md ✓ - Run BOOT.md on gateway startup
  📎 bootstrap-extra-files ✓ - Inject extra workspace bootstrap files during agent bootstrap
  📝 command-logger ✓ - Log all command events to a centralized audit file
  💾 session-memory ✓ - Save session context to memory when /new or /reset command is issued
```

**Example (verbose):**

```bash
GreenchClaw hooks list --verbose
```

Shows missing requirements for ineligible hooks.

**Example (JSON):**

```bash
GreenchClaw hooks list --json
```

Returns structured JSON for programmatic use.

## Get hook information

```bash
GreenchClaw hooks info <name>
```

Show detailed information about a specific hook.

**Arguments:**

- `<name>`: Hook name or hook key (e.g., `session-memory`)

**Options:**

- `--json`: Output as JSON

**Example:**

```bash
GreenchClaw hooks info session-memory
```

**Output:**

```
💾 session-memory ✓ Ready

Save session context to memory when /new or /reset command is issued

Details:
  Source: GreenchClaw-bundled
  Path: /path/to/GreenchClaw/hooks/bundled/session-memory/HOOK.md
  Handler: /path/to/GreenchClaw/hooks/bundled/session-memory/handler.ts
  Homepage: https://docs.GreenchClaw.ai/automation/hooks#session-memory
  Events: command:new, command:reset

Requirements:
  Config: ✓ workspace.dir
```

## Check hooks eligibility

```bash
GreenchClaw hooks check
```

Show summary of hook eligibility status (how many are ready vs. not ready).

**Options:**

- `--json`: Output as JSON

**Example output:**

```
Hooks Status

Total hooks: 4
Ready: 4
Not ready: 0
```

## Enable a Hook

```bash
GreenchClaw hooks enable <name>
```

Enable a specific hook by adding it to your config (`~/.GreenchClaw/GreenchClaw.json` by default).

**Note:** Workspace hooks are disabled by default until enabled here or in config. Hooks managed by plugins show `plugin:<id>` in `GreenchClaw hooks list` and can't be enabled/disabled here. Enable/disable the plugin instead.

**Arguments:**

- `<name>`: Hook name (e.g., `session-memory`)

**Example:**

```bash
GreenchClaw hooks enable session-memory
```

**Output:**

```
✓ Enabled hook: 💾 session-memory
```

**What it does:**

- Checks if hook exists and is eligible
- Updates `hooks.internal.entries.<name>.enabled = true` in your config
- Saves config to disk

If the hook came from `<workspace>/hooks/`, this opt-in step is required before
the Gateway will load it.

**After enabling:**

- Restart the gateway so hooks reload (menu bar app restart on macOS, or restart your gateway process in dev).

## Disable a Hook

```bash
GreenchClaw hooks disable <name>
```

Disable a specific hook by updating your config.

**Arguments:**

- `<name>`: Hook name (e.g., `command-logger`)

**Example:**

```bash
GreenchClaw hooks disable command-logger
```

**Output:**

```
⏸ Disabled hook: 📝 command-logger
```

**After disabling:**

- Restart the gateway so hooks reload

## Notes

- `GreenchClaw hooks list --json`, `info --json`, and `check --json` write structured JSON directly to stdout.
- Plugin-managed hooks cannot be enabled or disabled here; enable or disable the owning plugin instead.

## Install hook packs

```bash
GreenchClaw plugins install <package>        # npm by default
GreenchClaw plugins install npm:<package>    # npm only
GreenchClaw plugins install <package> --pin  # pin version
GreenchClaw plugins install <path>           # local path
```

Install hook packs through the unified plugins installer.

`GreenchClaw hooks install` still works as a compatibility alias, but it prints a
deprecation warning and forwards to `GreenchClaw plugins install`.

Npm specs are **registry-only** (package name + optional **exact version** or
**dist-tag**). Git/URL/file specs and semver ranges are rejected. Dependency
installs run project-local with `--ignore-scripts` for safety, even when your
shell has global npm install settings.

Bare specs and `@latest` stay on the stable track. If npm resolves either of
those to a prerelease, GreenchClaw stops and asks you to opt in explicitly with a
prerelease tag such as `@beta`/`@rc` or an exact prerelease version.

**What it does:**

- Copies the hook pack into `~/.GreenchClaw/hooks/<id>`
- Enables the installed hooks in `hooks.internal.entries.*`
- Records the install under `hooks.internal.installs`

**Options:**

- `-l, --link`: Link a local directory instead of copying (adds it to `hooks.internal.load.extraDirs`)
- `--pin`: Record npm installs as exact resolved `name@version` in `hooks.internal.installs`

**Supported archives:** `.zip`, `.tgz`, `.tar.gz`, `.tar`

**Examples:**

```bash
# Local directory
GreenchClaw plugins install ./my-hook-pack

# Local archive
GreenchClaw plugins install ./my-hook-pack.zip

# NPM package
GreenchClaw plugins install @GreenchClaw/my-hook-pack

# Link a local directory without copying
GreenchClaw plugins install -l ./my-hook-pack
```

Linked hook packs are treated as managed hooks from an operator-configured
directory, not as workspace hooks.

## Update hook packs

```bash
GreenchClaw plugins update <id>
GreenchClaw plugins update --all
```

Update tracked npm-based hook packs through the unified plugins updater.

`GreenchClaw hooks update` still works as a compatibility alias, but it prints a
deprecation warning and forwards to `GreenchClaw plugins update`.

**Options:**

- `--all`: Update all tracked hook packs
- `--dry-run`: Show what would change without writing

When a stored integrity hash exists and the fetched artifact hash changes,
GreenchClaw prints a warning and asks for confirmation before proceeding. Use
global `--yes` to bypass prompts in CI/non-interactive runs.

## Bundled hooks

### session-memory

Saves session context to memory when you issue `/new` or `/reset`.

**Enable:**

```bash
GreenchClaw hooks enable session-memory
```

**Output:** `~/.GreenchClaw/workspace/memory/YYYY-MM-DD-HHMM.md` by default. Set `hooks.internal.entries.session-memory.llmSlug: true` for model-generated filename slugs.

**See:** [session-memory documentation](/automation/hooks#session-memory)

### bootstrap-extra-files

Injects additional bootstrap files (for example monorepo-local `AGENTS.md` / `TOOLS.md`) during `agent:bootstrap`.

**Enable:**

```bash
GreenchClaw hooks enable bootstrap-extra-files
```

**See:** [bootstrap-extra-files documentation](/automation/hooks#bootstrap-extra-files)

### command-logger

Logs all command events to a centralized audit file.

**Enable:**

```bash
GreenchClaw hooks enable command-logger
```

**Output:** `~/.GreenchClaw/logs/commands.log`

**View logs:**

```bash
# Recent commands
tail -n 20 ~/.GreenchClaw/logs/commands.log

# Pretty-print
cat ~/.GreenchClaw/logs/commands.log | jq .

# Filter by action
grep '"action":"new"' ~/.GreenchClaw/logs/commands.log | jq .
```

**See:** [command-logger documentation](/automation/hooks#command-logger)

### boot-md

Runs `BOOT.md` when the gateway starts (after channels start).

**Events**: `gateway:startup`

**Enable**:

```bash
GreenchClaw hooks enable boot-md
```

**See:** [boot-md documentation](/automation/hooks#boot-md)

## Related

- [CLI reference](/cli)
- [Automation hooks](/automation/hooks)
