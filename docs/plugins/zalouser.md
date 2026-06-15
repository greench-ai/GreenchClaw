---
summary: "Zalo Personal plugin: QR login + messaging via native zca-js (plugin install + channel config + tool)"
read_when:
  - You want Zalo Personal (unofficial) support in GreenchClaw
  - You are configuring or developing the zalouser plugin
title: "Zalo personal plugin"
---

Zalo Personal support for GreenchClaw via a plugin, using native `zca-js` to automate a normal Zalo user account.

<Warning>
Unofficial automation may lead to account suspension or ban. Use at your own risk.
</Warning>

## Naming

Channel id is `zalouser` to make it explicit this automates a **personal Zalo user account** (unofficial). We keep `zalo` reserved for a potential future official Zalo API integration.

## Where it runs

This plugin runs **inside the Gateway process**.

If you use a remote Gateway, install/configure it on the **machine running the Gateway**, then restart the Gateway.

No external `zca`/`openzca` CLI binary is required.

## Install

### Option A: install from npm

```bash
GreenchClaw plugins install @GreenchClaw/zalouser
```

Use the bare package to follow the current official release tag. Pin an exact
version only when you need a reproducible install.

Restart the Gateway afterwards.

### Option B: install from a local folder (dev)

```bash
PLUGIN_SRC=./path/to/local/zalouser-plugin
GreenchClaw plugins install "$PLUGIN_SRC"
cd "$PLUGIN_SRC" && pnpm install
```

Restart the Gateway afterwards.

## Config

Channel config lives under `channels.zalouser` (not `plugins.entries.*`):

```json5
{
  channels: {
    zalouser: {
      enabled: true,
      dmPolicy: "pairing",
    },
  },
}
```

## CLI

```bash
GreenchClaw channels login --channel zalouser
GreenchClaw channels logout --channel zalouser
GreenchClaw channels status --probe
GreenchClaw message send --channel zalouser --target <threadId> --message "Hello from GreenchClaw"
GreenchClaw directory peers list --channel zalouser --query "name"
```

## Agent tool

Tool name: `zalouser`

Actions: `send`, `image`, `link`, `friends`, `groups`, `me`, `status`

Channel message actions also support `react` for message reactions.

## Related

- [Building plugins](/plugins/building-plugins)
- [ClawHub](/clawhub)
