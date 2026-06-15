import type { PluginRuntime } from "GreenchClaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "GreenchClaw/plugin-sdk/runtime-store";

const { setRuntime: setNostrRuntime, getRuntime: getNostrRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "nostr",
    errorMessage: "Nostr runtime not initialized",
  });
export { getNostrRuntime, setNostrRuntime };
