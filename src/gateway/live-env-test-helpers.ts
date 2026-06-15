const COMMON_LIVE_ENV_NAMES = [
  "GREENCHCLAW_AGENT_RUNTIME",
  "GREENCHCLAW_CONFIG_PATH",
  "GREENCHCLAW_GATEWAY_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "GREENCHCLAW_SKIP_BROWSER_CONTROL_SERVER",
  "GREENCHCLAW_SKIP_CANVAS_HOST",
  "GREENCHCLAW_SKIP_CHANNELS",
  "GREENCHCLAW_SKIP_CRON",
  "GREENCHCLAW_SKIP_GMAIL_WATCHER",
  "GREENCHCLAW_STATE_DIR",
] as const;

export type LiveEnvSnapshot = Record<string, string | undefined>;

export function snapshotLiveEnv(extraNames: readonly string[] = []): LiveEnvSnapshot {
  const snapshot: LiveEnvSnapshot = {};
  for (const name of [...COMMON_LIVE_ENV_NAMES, ...extraNames]) {
    snapshot[name] = process.env[name];
  }
  return snapshot;
}

export function restoreLiveEnv(snapshot: LiveEnvSnapshot): void {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
