---
summary: "Export GreenchClaw diagnostics to any OpenTelemetry collector via the diagnostics-otel plugin (OTLP/HTTP)"
title: "OpenTelemetry export"
read_when:
  - You want to send GreenchClaw model usage, message flow, or session metrics to an OpenTelemetry collector
  - You are wiring traces, metrics, or logs into Grafana, Datadog, Honeycomb, New Relic, Tempo, or another OTLP backend
  - You need the exact metric names, span names, or attribute shapes to build dashboards or alerts
---

GreenchClaw exports diagnostics through the official `diagnostics-otel` plugin
using **OTLP/HTTP (protobuf)**. Any collector or backend that accepts OTLP/HTTP
works without code changes. For local file logs and how to read them, see
[Logging](/logging).

## How it fits together

- **Diagnostics events** are structured, in-process records emitted by the
  Gateway and bundled plugins for model runs, message flow, sessions, queues,
  and exec.
- **`diagnostics-otel` plugin** subscribes to those events and exports them as
  OpenTelemetry **metrics**, **traces**, and **logs** over OTLP/HTTP.
- **Provider calls** receive a W3C `traceparent` header from GreenchClaw's
  trusted model-call span context when the provider transport accepts custom
  headers. Plugin-emitted trace context is not propagated.
- Exporters only attach when both the diagnostics surface and the plugin are
  enabled, so the in-process cost stays near zero by default.

## Quick start

For packaged installs, install the plugin first:

```bash
GreenchClaw plugins install clawhub:@GreenchClaw/diagnostics-otel
```

```json5
{
  plugins: {
    allow: ["diagnostics-otel"],
    entries: {
      "diagnostics-otel": { enabled: true },
    },
  },
  diagnostics: {
    enabled: true,
    otel: {
      enabled: true,
      endpoint: "http://otel-collector:4318",
      protocol: "http/protobuf",
      serviceName: "GreenchClaw-gateway",
      traces: true,
      metrics: true,
      logs: true,
      sampleRate: 0.2,
      flushIntervalMs: 60000,
    },
  },
}
```

You can also enable the plugin from the CLI:

```bash
GreenchClaw plugins enable diagnostics-otel
```

<Note>
`protocol` currently supports `http/protobuf` only. `grpc` is ignored.
</Note>

## Signals exported

| Signal      | What goes in it                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Metrics** | Counters and histograms for token usage, cost, run duration, message flow, Talk events, queue lanes, session state/recovery, exec, and memory pressure. |
| **Traces**  | Spans for model usage, model calls, harness lifecycle, tool execution, exec, webhook/message processing, context assembly, and tool loops.              |
| **Logs**    | Structured `logging.file` records exported over OTLP when `diagnostics.otel.logs` is enabled.                                                           |

Toggle `traces`, `metrics`, and `logs` independently. All three default to on
when `diagnostics.otel.enabled` is true.

## Configuration reference

```json5
{
  diagnostics: {
    enabled: true,
    otel: {
      enabled: true,
      endpoint: "http://otel-collector:4318",
      tracesEndpoint: "http://otel-collector:4318/v1/traces",
      metricsEndpoint: "http://otel-collector:4318/v1/metrics",
      logsEndpoint: "http://otel-collector:4318/v1/logs",
      protocol: "http/protobuf", // grpc is ignored
      serviceName: "GreenchClaw-gateway",
      headers: { "x-collector-token": "..." },
      traces: true,
      metrics: true,
      logs: true,
      sampleRate: 0.2, // root-span sampler, 0.0..1.0
      flushIntervalMs: 60000, // metric export interval (min 1000ms)
      captureContent: {
        enabled: false,
        inputMessages: false,
        outputMessages: false,
        toolInputs: false,
        toolOutputs: false,
        systemPrompt: false,
      },
    },
  },
}
```

### Environment variables

| Variable                                                                                                          | Purpose                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                                                                                     | Override `diagnostics.otel.endpoint`. If the value already contains `/v1/traces`, `/v1/metrics`, or `/v1/logs`, it is used as-is.                                                                                                          |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` / `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Signal-specific endpoint overrides used when the matching `diagnostics.otel.*Endpoint` config key is unset. Signal-specific config wins over signal-specific env, which wins over the shared endpoint.                                     |
| `OTEL_SERVICE_NAME`                                                                                               | Override `diagnostics.otel.serviceName`.                                                                                                                                                                                                   |
| `OTEL_EXPORTER_OTLP_PROTOCOL`                                                                                     | Override the wire protocol (only `http/protobuf` is honored today).                                                                                                                                                                        |
| `OTEL_SEMCONV_STABILITY_OPT_IN`                                                                                   | Set to `gen_ai_latest_experimental` to emit the latest experimental GenAI span attribute (`gen_ai.provider.name`) instead of the legacy `gen_ai.system`. GenAI metrics always use bounded, low-cardinality semantic attributes regardless. |
| `GREENCHCLAW_OTEL_PRELOADED`                                                                                      | Set to `1` when another preload or host process already registered the global OpenTelemetry SDK. The plugin then skips its own NodeSDK lifecycle but still wires diagnostic listeners and honors `traces`/`metrics`/`logs`.                |

## Privacy and content capture

Raw model/tool content is **not** exported by default. Spans carry bounded
identifiers (channel, provider, model, error category, hash-only request ids)
and never include prompt text, response text, tool inputs, tool outputs, or
session keys.
Talk metrics export only bounded event metadata such as mode, transport,
provider, and event type. They do not include transcripts, audio payloads,
session ids, turn ids, call ids, room ids, or handoff tokens.

Outbound model requests may include a W3C `traceparent` header. That header is
generated only from GreenchClaw-owned diagnostic trace context for the active model
call. Existing caller-supplied `traceparent` headers are replaced, so plugins or
custom provider options cannot spoof cross-service trace ancestry.

Set `diagnostics.otel.captureContent.*` to `true` only when your collector and
retention policy are approved for prompt, response, tool, or system-prompt
text. Each subkey is opt-in independently:

- `inputMessages` - user prompt content.
- `outputMessages` - model response content.
- `toolInputs` - tool argument payloads.
- `toolOutputs` - tool result payloads.
- `systemPrompt` - assembled system/developer prompt.

When any subkey is enabled, model and tool spans get bounded, redacted
`GreenchClaw.content.*` attributes for that class only.

## Sampling and flushing

- **Traces:** `diagnostics.otel.sampleRate` (root-span only, `0.0` drops all,
  `1.0` keeps all).
- **Metrics:** `diagnostics.otel.flushIntervalMs` (minimum `1000`).
- **Logs:** OTLP logs respect `logging.level` (file log level). They use the
  diagnostic log-record redaction path, not console formatting. High-volume
  installs should prefer OTLP collector sampling/filtering over local sampling.
- **File-log correlation:** JSONL file logs include top-level `traceId`,
  `spanId`, `parentSpanId`, and `traceFlags` when the log call carries a valid
  diagnostic trace context, which lets log processors join local log lines with
  exported spans.
- **Request correlation:** Gateway HTTP requests and WebSocket frames create an
  internal request trace scope. Logs and diagnostic events inside that scope
  inherit the request trace by default, while agent run and model-call spans are
  created as children so provider `traceparent` headers stay on the same trace.

## Exported metrics

### Model usage

- `GreenchClaw.tokens` (counter, attrs: `GreenchClaw.token`, `GreenchClaw.channel`, `GreenchClaw.provider`, `GreenchClaw.model`, `GreenchClaw.agent`)
- `GreenchClaw.cost.usd` (counter, attrs: `GreenchClaw.channel`, `GreenchClaw.provider`, `GreenchClaw.model`)
- `GreenchClaw.run.duration_ms` (histogram, attrs: `GreenchClaw.channel`, `GreenchClaw.provider`, `GreenchClaw.model`)
- `GreenchClaw.context.tokens` (histogram, attrs: `GreenchClaw.context`, `GreenchClaw.channel`, `GreenchClaw.provider`, `GreenchClaw.model`)
- `gen_ai.client.token.usage` (histogram, GenAI semantic-conventions metric, attrs: `gen_ai.token.type` = `input`/`output`, `gen_ai.provider.name`, `gen_ai.operation.name`, `gen_ai.request.model`)
- `gen_ai.client.operation.duration` (histogram, seconds, GenAI semantic-conventions metric, attrs: `gen_ai.provider.name`, `gen_ai.operation.name`, `gen_ai.request.model`, optional `error.type`)
- `GreenchClaw.model_call.duration_ms` (histogram, attrs: `GreenchClaw.provider`, `GreenchClaw.model`, `GreenchClaw.api`, `GreenchClaw.transport`, plus `GreenchClaw.errorCategory` and `GreenchClaw.failureKind` on classified errors)
- `GreenchClaw.model_call.request_bytes` (histogram, UTF-8 byte size of the final model request payload; no raw payload content)
- `GreenchClaw.model_call.response_bytes` (histogram, UTF-8 byte size of streamed model response events; no raw response content)
- `GreenchClaw.model_call.time_to_first_byte_ms` (histogram, elapsed time before the first streamed response event)

### Message flow

- `GreenchClaw.webhook.received` (counter, attrs: `GreenchClaw.channel`, `GreenchClaw.webhook`)
- `GreenchClaw.webhook.error` (counter, attrs: `GreenchClaw.channel`, `GreenchClaw.webhook`)
- `GreenchClaw.webhook.duration_ms` (histogram, attrs: `GreenchClaw.channel`, `GreenchClaw.webhook`)
- `GreenchClaw.message.queued` (counter, attrs: `GreenchClaw.channel`, `GreenchClaw.source`)
- `GreenchClaw.message.processed` (counter, attrs: `GreenchClaw.channel`, `GreenchClaw.outcome`)
- `GreenchClaw.message.duration_ms` (histogram, attrs: `GreenchClaw.channel`, `GreenchClaw.outcome`)
- `GreenchClaw.message.delivery.started` (counter, attrs: `GreenchClaw.channel`, `GreenchClaw.delivery.kind`)
- `GreenchClaw.message.delivery.duration_ms` (histogram, attrs: `GreenchClaw.channel`, `GreenchClaw.delivery.kind`, `GreenchClaw.outcome`, `GreenchClaw.errorCategory`)

### Talk

- `GreenchClaw.talk.event` (counter, attrs: `GreenchClaw.talk.event_type`, `GreenchClaw.talk.mode`, `GreenchClaw.talk.transport`, `GreenchClaw.talk.brain`, `GreenchClaw.talk.provider`)
- `GreenchClaw.talk.event.duration_ms` (histogram, attrs: same as `GreenchClaw.talk.event`; emitted when a Talk event reports duration)
- `GreenchClaw.talk.audio.bytes` (histogram, attrs: same as `GreenchClaw.talk.event`; emitted for Talk audio frame events that report byte length)

### Queues and sessions

- `GreenchClaw.queue.lane.enqueue` (counter, attrs: `GreenchClaw.lane`)
- `GreenchClaw.queue.lane.dequeue` (counter, attrs: `GreenchClaw.lane`)
- `GreenchClaw.queue.depth` (histogram, attrs: `GreenchClaw.lane` or `GreenchClaw.channel=heartbeat`)
- `GreenchClaw.queue.wait_ms` (histogram, attrs: `GreenchClaw.lane`)
- `GreenchClaw.session.state` (counter, attrs: `GreenchClaw.state`, `GreenchClaw.reason`)
- `GreenchClaw.session.stuck` (counter, attrs: `GreenchClaw.state`; emitted only for stale session bookkeeping with no active work)
- `GreenchClaw.session.stuck_age_ms` (histogram, attrs: `GreenchClaw.state`; emitted only for stale session bookkeeping with no active work)
- `GreenchClaw.session.recovery.requested` (counter, attrs: `GreenchClaw.state`, `GreenchClaw.action`, `GreenchClaw.active_work_kind`, `GreenchClaw.reason`)
- `GreenchClaw.session.recovery.completed` (counter, attrs: `GreenchClaw.state`, `GreenchClaw.action`, `GreenchClaw.status`, `GreenchClaw.active_work_kind`, `GreenchClaw.reason`)
- `GreenchClaw.session.recovery.age_ms` (histogram, attrs: same as the matching recovery counter)
- `GreenchClaw.run.attempt` (counter, attrs: `GreenchClaw.attempt`)

### Session liveness telemetry

`diagnostics.stuckSessionWarnMs` is the no-progress age threshold for session
liveness diagnostics. A `processing` session does not age toward this threshold
while GreenchClaw observes reply, tool, status, block, or ACP runtime progress.
Typing keepalives are not counted as progress, so a silent model or harness can
still be detected.

GreenchClaw classifies sessions by the work it can still observe:

- `session.long_running`: active embedded work, model calls, or tool calls are
  still making progress.
- `session.stalled`: active work exists, but the active run has not reported
  recent progress. Stalled embedded runs stay observe-only at first, then
  abort-drain after `diagnostics.stuckSessionAbortMs` with no progress so queued
  turns behind the lane can resume. When unset, the abort threshold defaults to
  the safer extended window of at least 10 minutes and 5x
  `diagnostics.stuckSessionWarnMs`.
- `session.stuck`: stale session bookkeeping with no active work. This releases
  the affected session lane immediately.

Recovery emits structured `session.recovery.requested` and
`session.recovery.completed` events. Diagnostic session state is marked idle
only after a mutating recovery outcome (`aborted` or `released`) and only if the
same processing generation is still current.

Only `session.stuck` emits the `GreenchClaw.session.stuck` counter, the
`GreenchClaw.session.stuck_age_ms` histogram, and the `GreenchClaw.session.stuck`
span. Repeated `session.stuck` diagnostics back off while the session remains
unchanged, so dashboards should alert on sustained increases rather than every
heartbeat tick. For the config knob and defaults, see
[Configuration reference](/gateway/configuration-reference#diagnostics).

### Harness lifecycle

- `GreenchClaw.harness.duration_ms` (histogram, attrs: `GreenchClaw.harness.id`, `GreenchClaw.harness.plugin`, `GreenchClaw.outcome`, `GreenchClaw.harness.phase` on errors)

### Exec

- `GreenchClaw.exec.duration_ms` (histogram, attrs: `GreenchClaw.exec.target`, `GreenchClaw.exec.mode`, `GreenchClaw.outcome`, `GreenchClaw.failureKind`)

### Diagnostics internals (memory and tool loop)

- `GreenchClaw.memory.heap_used_bytes` (histogram, attrs: `GreenchClaw.memory.kind`)
- `GreenchClaw.memory.rss_bytes` (histogram)
- `GreenchClaw.memory.pressure` (counter, attrs: `GreenchClaw.memory.level`)
- `GreenchClaw.tool.loop.iterations` (counter, attrs: `GreenchClaw.toolName`, `GreenchClaw.outcome`)
- `GreenchClaw.tool.loop.duration_ms` (histogram, attrs: `GreenchClaw.toolName`, `GreenchClaw.outcome`)

## Exported spans

- `GreenchClaw.model.usage`
  - `GreenchClaw.channel`, `GreenchClaw.provider`, `GreenchClaw.model`
  - `GreenchClaw.tokens.*` (input/output/cache_read/cache_write/total)
  - `gen_ai.system` by default, or `gen_ai.provider.name` when the latest GenAI semantic conventions are opted in
  - `gen_ai.request.model`, `gen_ai.operation.name`, `gen_ai.usage.*`
- `GreenchClaw.run`
  - `GreenchClaw.outcome`, `GreenchClaw.channel`, `GreenchClaw.provider`, `GreenchClaw.model`, `GreenchClaw.errorCategory`
- `GreenchClaw.model.call`
  - `gen_ai.system` by default, or `gen_ai.provider.name` when the latest GenAI semantic conventions are opted in
  - `gen_ai.request.model`, `gen_ai.operation.name`, `GreenchClaw.provider`, `GreenchClaw.model`, `GreenchClaw.api`, `GreenchClaw.transport`
  - `GreenchClaw.errorCategory` and optional `GreenchClaw.failureKind` on errors
  - `GreenchClaw.model_call.request_bytes`, `GreenchClaw.model_call.response_bytes`, `GreenchClaw.model_call.time_to_first_byte_ms`
  - `GreenchClaw.provider.request_id_hash` (bounded SHA-based hash of the upstream provider request id; raw ids are not exported)
- `GreenchClaw.harness.run`
  - `GreenchClaw.harness.id`, `GreenchClaw.harness.plugin`, `GreenchClaw.outcome`, `GreenchClaw.provider`, `GreenchClaw.model`, `GreenchClaw.channel`
  - On completion: `GreenchClaw.harness.result_classification`, `GreenchClaw.harness.yield_detected`, `GreenchClaw.harness.items.started`, `GreenchClaw.harness.items.completed`, `GreenchClaw.harness.items.active`
  - On error: `GreenchClaw.harness.phase`, `GreenchClaw.errorCategory`, optional `GreenchClaw.harness.cleanup_failed`
- `GreenchClaw.tool.execution`
  - `gen_ai.tool.name`, `GreenchClaw.toolName`, `GreenchClaw.errorCategory`, `GreenchClaw.tool.params.*`
- `GreenchClaw.exec`
  - `GreenchClaw.exec.target`, `GreenchClaw.exec.mode`, `GreenchClaw.outcome`, `GreenchClaw.failureKind`, `GreenchClaw.exec.command_length`, `GreenchClaw.exec.exit_code`, `GreenchClaw.exec.timed_out`
- `GreenchClaw.webhook.processed`
  - `GreenchClaw.channel`, `GreenchClaw.webhook`
- `GreenchClaw.webhook.error`
  - `GreenchClaw.channel`, `GreenchClaw.webhook`, `GreenchClaw.error`
- `GreenchClaw.message.processed`
  - `GreenchClaw.channel`, `GreenchClaw.outcome`, `GreenchClaw.reason`
- `GreenchClaw.message.delivery`
  - `GreenchClaw.channel`, `GreenchClaw.delivery.kind`, `GreenchClaw.outcome`, `GreenchClaw.errorCategory`, `GreenchClaw.delivery.result_count`
- `GreenchClaw.session.stuck`
  - `GreenchClaw.state`, `GreenchClaw.ageMs`, `GreenchClaw.queueDepth`
- `GreenchClaw.context.assembled`
  - `GreenchClaw.prompt.size`, `GreenchClaw.history.size`, `GreenchClaw.context.tokens`, `GreenchClaw.errorCategory` (no prompt, history, response, or session-key content)
- `GreenchClaw.tool.loop`
  - `GreenchClaw.toolName`, `GreenchClaw.outcome`, `GreenchClaw.iterations`, `GreenchClaw.errorCategory` (no loop messages, params, or tool output)
- `GreenchClaw.memory.pressure`
  - `GreenchClaw.memory.level`, `GreenchClaw.memory.heap_used_bytes`, `GreenchClaw.memory.rss_bytes`

When content capture is explicitly enabled, model and tool spans can also
include bounded, redacted `GreenchClaw.content.*` attributes for the specific
content classes you opted into.

## Diagnostic event catalog

The events below back the metrics and spans above. Plugins can also subscribe
to them directly without OTLP export.

**Model usage**

- `model.usage` - tokens, cost, duration, context, provider/model/channel,
  session ids. `usage` is provider/turn accounting for cost and telemetry;
  `context.used` is the current prompt/context snapshot and can be lower than
  provider `usage.total` when cached input or tool-loop calls are involved.

**Message flow**

- `webhook.received` / `webhook.processed` / `webhook.error`
- `message.queued` / `message.processed`
- `message.delivery.started` / `message.delivery.completed` / `message.delivery.error`

**Queue and session**

- `queue.lane.enqueue` / `queue.lane.dequeue`
- `session.state` / `session.long_running` / `session.stalled` / `session.stuck`
- `run.attempt` / `run.progress`
- `diagnostic.heartbeat` (aggregate counters: webhooks/queue/session)

**Harness lifecycle**

- `harness.run.started` / `harness.run.completed` / `harness.run.error` -
  per-run lifecycle for the agent harness. Includes `harnessId`, optional
  `pluginId`, provider/model/channel, and run id. Completion adds
  `durationMs`, `outcome`, optional `resultClassification`, `yieldDetected`,
  and `itemLifecycle` counts. Errors add `phase`
  (`prepare`/`start`/`send`/`resolve`/`cleanup`), `errorCategory`, and
  optional `cleanupFailed`.

**Exec**

- `exec.process.completed` - terminal outcome, duration, target, mode, exit
  code, and failure kind. Command text and working directories are not
  included.

## Without an exporter

You can keep diagnostics events available to plugins or custom sinks without
running `diagnostics-otel`:

```json5
{
  diagnostics: { enabled: true },
}
```

For targeted debug output without raising `logging.level`, use diagnostics
flags. Flags are case-insensitive and support wildcards (e.g. `telegram.*` or
`*`):

```json5
{
  diagnostics: { flags: ["telegram.http"] },
}
```

Or as a one-off env override:

```bash
GREENCHCLAW_DIAGNOSTICS=telegram.http,telegram.payload GreenchClaw gateway
```

Flag output goes to the standard log file (`logging.file`) and is still
redacted by `logging.redactSensitive`. Full guide:
[Diagnostics flags](/diagnostics/flags).

## Disable

```json5
{
  diagnostics: { otel: { enabled: false } },
}
```

You can also leave `diagnostics-otel` out of `plugins.allow`, or run
`GreenchClaw plugins disable diagnostics-otel`.

## Related

- [Logging](/logging) - file logs, console output, CLI tailing, and the Control UI Logs tab
- [Gateway logging internals](/gateway/logging) - WS log styles, subsystem prefixes, and console capture
- [Diagnostics flags](/diagnostics/flags) - targeted debug-log flags
- [Diagnostics export](/gateway/diagnostics) - operator support-bundle tool (separate from OTEL export)
- [Configuration reference](/gateway/configuration-reference#diagnostics) - full `diagnostics.*` field reference
