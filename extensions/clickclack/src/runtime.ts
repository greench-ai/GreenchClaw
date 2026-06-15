import { createPluginRuntimeStore } from "GreenchClaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "GreenchClaw/plugin-sdk/runtime-store";

const { setRuntime: setClickClackRuntime, getRuntime: getClickClackRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "clickclack",
    errorMessage: "ClickClack runtime not initialized",
  });

export { getClickClackRuntime, setClickClackRuntime };
