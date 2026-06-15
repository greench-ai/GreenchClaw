---
summary: "CLI reference for `GreenchClaw browser` (lifecycle, profiles, tabs, actions, state, and debugging)"
read_when:
  - You use `GreenchClaw browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to attach to your local signed-in Chrome via Chrome MCP
title: "Browser"
---

# `GreenchClaw browser`

Manage GreenchClaw's browser control surface and run browser actions (lifecycle, profiles, tabs, snapshots, screenshots, navigation, input, state emulation, and debugging).

Related:

- Browser tool + API: [Browser tool](/tools/browser)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--expect-final`: wait for a final Gateway response.
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
GreenchClaw browser profiles
GreenchClaw browser --browser-profile GreenchClaw start
GreenchClaw browser --browser-profile GreenchClaw open https://example.com
GreenchClaw browser --browser-profile GreenchClaw snapshot
```

Agents can run the same readiness check with `browser({ action: "doctor" })`.

## Quick troubleshooting

If `start` fails with `not reachable after start`, troubleshoot CDP readiness first. If `start` and `tabs` succeed but `open` or `navigate` fails, the browser control plane is healthy and the failure is usually navigation SSRF policy.

Minimal sequence:

```bash
GreenchClaw browser --browser-profile GreenchClaw doctor
GreenchClaw browser --browser-profile GreenchClaw start
GreenchClaw browser --browser-profile GreenchClaw tabs
GreenchClaw browser --browser-profile GreenchClaw open https://example.com
```

Detailed guidance: [Browser troubleshooting](/tools/browser#cdp-startup-failure-vs-navigation-ssrf-block)

## Lifecycle

```bash
GreenchClaw browser status
GreenchClaw browser doctor
GreenchClaw browser doctor --deep
GreenchClaw browser start
GreenchClaw browser start --headless
GreenchClaw browser stop
GreenchClaw browser --browser-profile GreenchClaw reset-profile
```

Notes:

- `doctor --deep` adds a live snapshot probe. It is useful when basic CDP
  readiness is green but you want proof that the current tab can be inspected.
- For `attachOnly` and remote CDP profiles, `GreenchClaw browser stop` closes the
  active control session and clears temporary emulation overrides even when
  GreenchClaw did not launch the browser process itself.
- For local managed profiles, `GreenchClaw browser stop` stops the spawned browser
  process.
- `GreenchClaw browser start --headless` applies only to that start request and
  only when GreenchClaw launches a local managed browser. It does not rewrite
  `browser.headless` or profile config, and it is a no-op for an already-running
  browser.
- On Linux hosts without `DISPLAY` or `WAYLAND_DISPLAY`, local managed profiles
  run headless automatically unless `GREENCHCLAW_BROWSER_HEADLESS=0`,
  `browser.headless=false`, or `browser.profiles.<name>.headless=false`
  explicitly requests a visible browser.

## If the command is missing

If `GreenchClaw browser` is an unknown command, check `plugins.allow` in
`~/.GreenchClaw/GreenchClaw.json`.

When `plugins.allow` is present, list the bundled browser plugin explicitly
unless the config already has a root `browser` block:

```json5
{
  plugins: {
    allow: ["telegram", "browser"],
  },
}
```

An explicit root `browser` block, for example `browser.enabled=true` or
`browser.profiles.<name>`, also activates the bundled browser plugin under a
restrictive plugin allowlist.

Related: [Browser tool](/tools/browser#missing-browser-command-or-tool)

## Profiles

Profiles are named browser routing configs. In practice:

- `GreenchClaw`: launches or attaches to a dedicated GreenchClaw-managed Chrome instance (isolated user data dir).
- `user`: controls your existing signed-in Chrome session via Chrome DevTools MCP.
- custom CDP profiles: point at a local or remote CDP endpoint.

```bash
GreenchClaw browser profiles
GreenchClaw browser create-profile --name work --color "#FF5A36"
GreenchClaw browser create-profile --name chrome-live --driver existing-session
GreenchClaw browser create-profile --name remote --cdp-url https://browser-host.example.com
GreenchClaw browser delete-profile --name work
```

Use a specific profile:

```bash
GreenchClaw browser --browser-profile work tabs
```

## Tabs

```bash
GreenchClaw browser tabs
GreenchClaw browser tab new --label docs
GreenchClaw browser tab label t1 docs
GreenchClaw browser tab select 2
GreenchClaw browser tab close 2
GreenchClaw browser open https://docs.GreenchClaw.ai --label docs
GreenchClaw browser focus docs
GreenchClaw browser close t1
```

`tabs` returns `suggestedTargetId` first, then the stable `tabId` such as `t1`,
the optional label, and the raw `targetId`. Agents should pass
`suggestedTargetId` back into `focus`, `close`, snapshots, and actions. You can
assign a label with `open --label`, `tab new --label`, or `tab label`; labels,
tab ids, raw target ids, and unique target-id prefixes are all accepted.
When Chromium replaces the underlying raw target during a navigation or form
submit, GreenchClaw keeps the stable `tabId`/label attached to the replacement tab
when it can prove the match. Raw target ids remain volatile; prefer
`suggestedTargetId`.

## Snapshot / screenshot / actions

Snapshot:

```bash
GreenchClaw browser snapshot
GreenchClaw browser snapshot --urls
```

Screenshot:

```bash
GreenchClaw browser screenshot
GreenchClaw browser screenshot --full-page
GreenchClaw browser screenshot --ref e12
GreenchClaw browser screenshot --labels
```

Notes:

- `--full-page` is for page captures only; it cannot be combined with `--ref`
  or `--element`.
- `existing-session` / `user` profiles support page screenshots and `--ref`
  screenshots from snapshot output, but not CSS `--element` screenshots.
- `--labels` overlays current snapshot refs on the screenshot.
- `snapshot --urls` appends discovered link destinations to AI snapshots so
  agents can choose direct navigation targets instead of guessing from link
  text alone.

Navigate/click/type (ref-based UI automation):

```bash
GreenchClaw browser navigate https://example.com
GreenchClaw browser click <ref>
GreenchClaw browser click-coords 120 340
GreenchClaw browser type <ref> "hello"
GreenchClaw browser press Enter
GreenchClaw browser hover <ref>
GreenchClaw browser scrollintoview <ref>
GreenchClaw browser drag <startRef> <endRef>
GreenchClaw browser select <ref> OptionA OptionB
GreenchClaw browser fill --fields '[{"ref":"1","value":"Ada"}]'
GreenchClaw browser wait --text "Done"
GreenchClaw browser evaluate --fn '(el) => el.textContent' --ref <ref>
```

Action responses return the current raw `targetId` after action-triggered page
replacement when GreenchClaw can prove the replacement tab. Scripts should still
store and pass `suggestedTargetId`/labels for long-lived workflows.

File + dialog helpers:

```bash
GreenchClaw browser upload /tmp/GreenchClaw/uploads/file.pdf --ref <ref>
GreenchClaw browser waitfordownload
GreenchClaw browser download <ref> report.pdf
GreenchClaw browser dialog --accept
```

Managed Chrome profiles save ordinary click-triggered downloads into the GreenchClaw
downloads directory (`/tmp/GreenchClaw/downloads` by default, or the configured temp
root). Use `waitfordownload` or `download` when the agent needs to wait for a
specific file and return its path; those explicit waiters own the next download.

## State and storage

Viewport + emulation:

```bash
GreenchClaw browser resize 1280 720
GreenchClaw browser set viewport 1280 720
GreenchClaw browser set offline on
GreenchClaw browser set media dark
GreenchClaw browser set timezone Europe/London
GreenchClaw browser set locale en-GB
GreenchClaw browser set geo 51.5074 -0.1278 --accuracy 25
GreenchClaw browser set device "iPhone 14"
GreenchClaw browser set headers '{"x-test":"1"}'
GreenchClaw browser set credentials myuser mypass
```

Cookies + storage:

```bash
GreenchClaw browser cookies
GreenchClaw browser cookies set session abc123 --url https://example.com
GreenchClaw browser cookies clear
GreenchClaw browser storage local get
GreenchClaw browser storage local set token abc123
GreenchClaw browser storage session clear
```

## Debugging

```bash
GreenchClaw browser console --level error
GreenchClaw browser pdf
GreenchClaw browser responsebody "**/api"
GreenchClaw browser highlight <ref>
GreenchClaw browser errors --clear
GreenchClaw browser requests --filter api
GreenchClaw browser trace start
GreenchClaw browser trace stop --out trace.zip
```

## Existing Chrome via MCP

Use the built-in `user` profile, or create your own `existing-session` profile:

```bash
GreenchClaw browser --browser-profile user tabs
GreenchClaw browser create-profile --name chrome-live --driver existing-session
GreenchClaw browser create-profile --name brave-live --driver existing-session --user-data-dir "~/Library/Application Support/BraveSoftware/Brave-Browser"
GreenchClaw browser --browser-profile chrome-live tabs
```

This path is host-only. For Docker, headless servers, Browserless, or other remote setups, use a CDP profile instead.

Current existing-session limits:

- snapshot-driven actions use refs, not CSS selectors
- `browser.actionTimeoutMs` defaults supported `act` requests to 60000 ms when
  callers omit `timeoutMs`; per-call `timeoutMs` still wins.
- `click` is left-click only
- `type` does not support `slowly=true`
- `press` does not support `delayMs`
- `hover`, `scrollintoview`, `drag`, `select`, `fill`, and `evaluate` reject
  per-call timeout overrides
- `select` supports one value only
- `wait --load networkidle` is not supported
- file uploads require `--ref` / `--input-ref`, do not support CSS
  `--element`, and currently support one file at a time
- dialog hooks do not support `--timeout`
- screenshots support page captures and `--ref`, but not CSS `--element`
- `responsebody`, download interception, PDF export, and batch actions still
  require a managed browser or raw CDP profile

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)

## Related

- [CLI reference](/cli)
- [Browser](/tools/browser)
