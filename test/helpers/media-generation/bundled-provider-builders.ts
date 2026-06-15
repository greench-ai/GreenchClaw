import type { GreenchClawPluginApi } from "../../../src/plugins/types.js";
import { loadBundledPluginPublicSurfaceSync } from "../../../src/test-utils/bundled-plugin-public-surface.js";

type BundledPluginEntryModule = {
  default: {
    register(api: GreenchClawPluginApi): void;
  };
};

export function loadBundledProviderPlugin(pluginId: string): BundledPluginEntryModule["default"] {
  return loadBundledPluginPublicSurfaceSync<BundledPluginEntryModule>({
    pluginId,
    artifactBasename: "index.js",
  }).default;
}
