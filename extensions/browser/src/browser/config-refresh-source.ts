import {
  getRuntimeConfig,
  getRuntimeConfigSourceSnapshot,
  type GreenchClawConfig,
} from "../config/config.js";

export function loadBrowserConfigForRuntimeRefresh(): GreenchClawConfig {
  return getRuntimeConfigSourceSnapshot() ?? getRuntimeConfig();
}
