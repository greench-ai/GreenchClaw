import {
  getRuntimeConfigSnapshot,
  getRuntimeConfigSourceSnapshot,
} from "../config/runtime-snapshot.js";
import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";

export function resolvePluginActivationSourceConfig(params: {
  config?: GreenchClawConfig;
  activationSourceConfig?: GreenchClawConfig;
}): GreenchClawConfig {
  if (params.activationSourceConfig !== undefined) {
    return params.activationSourceConfig;
  }
  const sourceSnapshot = getRuntimeConfigSourceSnapshot();
  if (sourceSnapshot && params.config === getRuntimeConfigSnapshot()) {
    return sourceSnapshot;
  }
  return params.config ?? {};
}
