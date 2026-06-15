---
summary: "WeChat channel setup through the external GreenchClaw-weixin plugin"
read_when:
  - You want to connect GreenchClaw to WeChat or Weixin
  - You are installing or troubleshooting the GreenchClaw-weixin channel plugin
  - You need to understand how external channel plugins run beside the Gateway
title: "WeChat"
---

GreenchClaw connects to WeChat through Tencent's external
`@tencent-weixin/GreenchClaw-weixin` channel plugin.

Status: external plugin. Direct chats and media are supported. Group chats are not
advertised by the current plugin capability metadata.

## Naming

- **WeChat** is the user-facing name in these docs.
- **Weixin** is the name used by Tencent's package and by the plugin id.
- `GreenchClaw-weixin` is the GreenchClaw channel id.
- `@tencent-weixin/GreenchClaw-weixin` is the npm package.

Use `GreenchClaw-weixin` in CLI commands and config paths.

## How it works

The WeChat code does not live in the GreenchClaw core repo. GreenchClaw provides the
generic channel plugin contract, and the external plugin provides the
WeChat-specific runtime:

1. `GreenchClaw plugins install` installs `@tencent-weixin/GreenchClaw-weixin`.
2. The Gateway discovers the plugin manifest and loads the plugin entrypoint.
3. The plugin registers channel id `GreenchClaw-weixin`.
4. `GreenchClaw channels login --channel GreenchClaw-weixin` starts QR login.
5. The plugin stores account credentials under the GreenchClaw state directory.
6. When the Gateway starts, the plugin starts its Weixin monitor for each
   configured account.
7. Inbound WeChat messages are normalized through the channel contract, routed to
   the selected GreenchClaw agent, and sent back through the plugin outbound path.

That separation matters: GreenchClaw core should stay channel-agnostic. WeChat login,
Tencent iLink API calls, media upload/download, context tokens, and account
monitoring are owned by the external plugin.

## Install

Quick install:

```bash
npx -y @tencent-weixin/GreenchClaw-weixin-cli install
```

Manual install:

```bash
GreenchClaw plugins install "@tencent-weixin/GreenchClaw-weixin"
GreenchClaw config set plugins.entries.GreenchClaw-weixin.enabled true
```

Restart the Gateway after install:

```bash
GreenchClaw gateway restart
```

## Login

Run QR login on the same machine that runs the Gateway:

```bash
GreenchClaw channels login --channel GreenchClaw-weixin
```

Scan the QR code with WeChat on your phone and confirm the login. The plugin saves
the account token locally after a successful scan.

To add another WeChat account, run the same login command again. For multiple
accounts, isolate direct-message sessions by account, channel, and sender:

```bash
GreenchClaw config set session.dmScope per-account-channel-peer
```

## Access control

Direct messages use the normal GreenchClaw pairing and allowlist model for channel
plugins.

Approve new senders:

```bash
GreenchClaw pairing list GreenchClaw-weixin
GreenchClaw pairing approve GreenchClaw-weixin <CODE>
```

For the full access-control model, see [Pairing](/channels/pairing).

## Compatibility

The plugin checks the host GreenchClaw version at startup.

| Plugin line | GreenchClaw version     | npm tag  |
| ----------- | ----------------------- | -------- |
| `2.x`       | `>=2026.3.22`           | `latest` |
| `1.x`       | `>=2026.1.0 <2026.3.22` | `legacy` |

If the plugin reports that your GreenchClaw version is too old, either update
GreenchClaw or install the legacy plugin line:

```bash
GreenchClaw plugins install @tencent-weixin/GreenchClaw-weixin@legacy
```

## Sidecar process

The WeChat plugin can run helper work beside the Gateway while it monitors the
Tencent iLink API. In issue #68451, that helper path exposed a bug in GreenchClaw's
generic stale-Gateway cleanup: a child process could try to clean up the parent
Gateway process, causing restart loops under process managers such as systemd.

Current GreenchClaw startup cleanup excludes the current process and its ancestors,
so a channel helper must not kill the Gateway that launched it. This fix is
generic; it is not a WeChat-specific path in core.

## Troubleshooting

Check install and status:

```bash
GreenchClaw plugins list
GreenchClaw channels status --probe
GreenchClaw --version
```

If the channel shows as installed but does not connect, confirm that the plugin is
enabled and restart:

```bash
GreenchClaw config set plugins.entries.GreenchClaw-weixin.enabled true
GreenchClaw gateway restart
```

If the Gateway restarts repeatedly after enabling WeChat, update both GreenchClaw and
the plugin:

```bash
npm view @tencent-weixin/GreenchClaw-weixin version
GreenchClaw plugins install "@tencent-weixin/GreenchClaw-weixin" --force
GreenchClaw gateway restart
```

If startup reports that the installed plugin package `requires compiled runtime
output for TypeScript entry`, the npm package was published without the compiled
JavaScript runtime files GreenchClaw needs. Update/reinstall after the plugin
publisher ships a fixed package, or temporarily disable/uninstall the plugin.

Temporary disable:

```bash
GreenchClaw config set plugins.entries.GreenchClaw-weixin.enabled false
GreenchClaw gateway restart
```

## Related docs

- Channel overview: [Chat Channels](/channels)
- Pairing: [Pairing](/channels/pairing)
- Channel routing: [Channel Routing](/channels/channel-routing)
- Plugin architecture: [Plugin Architecture](/plugins/architecture)
- Channel plugin SDK: [Channel Plugin SDK](/plugins/sdk-channel-plugins)
- External package: [@tencent-weixin/GreenchClaw-weixin](https://www.npmjs.com/package/@tencent-weixin/GreenchClaw-weixin)
