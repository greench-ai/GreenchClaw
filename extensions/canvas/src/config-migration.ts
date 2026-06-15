import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import { isRecord } from "GreenchClaw/plugin-sdk/string-coerce-runtime";

type MutableRecord = Record<string, unknown>;

function readRecord(value: unknown): MutableRecord | undefined {
  return isRecord(value) ? (value as MutableRecord) : undefined;
}

function mergeHostConfig(params: {
  legacyHost: MutableRecord;
  existingHost: MutableRecord | undefined;
}): MutableRecord {
  return Object.assign({}, params.legacyHost, params.existingHost);
}

export function migrateLegacyCanvasHostConfig(config: GreenchClawConfig): {
  config: GreenchClawConfig;
  changes: string[];
} | null {
  const legacyHost = readRecord((config as { canvasHost?: unknown }).canvasHost);
  if (!legacyHost) {
    return null;
  }

  const plugins = structuredClone(readRecord(config.plugins) ?? {});
  const entries = readRecord(plugins.entries) ?? {};
  const canvasEntry = readRecord(entries.canvas) ?? {};
  const canvasConfig = readRecord(canvasEntry.config) ?? {};
  const existingHost = readRecord(canvasConfig.host);

  entries.canvas = {
    ...canvasEntry,
    config: {
      ...canvasConfig,
      host: mergeHostConfig({
        legacyHost,
        existingHost,
      }),
    },
  };
  plugins.entries = entries;

  const next = { ...config, plugins } as GreenchClawConfig & { canvasHost?: unknown };
  delete next.canvasHost;

  return {
    config: next,
    changes: ["migrated canvasHost to plugins.entries.canvas.config.host"],
  };
}
