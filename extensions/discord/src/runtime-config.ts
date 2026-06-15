import {
  getRuntimeConfigSnapshot,
  getRuntimeConfigSourceSnapshot,
  selectApplicableRuntimeConfig,
} from "GreenchClaw/plugin-sdk/runtime-config-snapshot";
import type { GreenchClawConfig } from "./runtime-api.js";

export function selectDiscordRuntimeConfig(inputConfig: GreenchClawConfig): GreenchClawConfig {
  return (
    selectApplicableRuntimeConfig({
      inputConfig,
      runtimeConfig: getRuntimeConfigSnapshot(),
      runtimeSourceConfig: getRuntimeConfigSourceSnapshot(),
    }) ?? inputConfig
  );
}
