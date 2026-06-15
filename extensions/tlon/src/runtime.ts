import type { PluginRuntime } from "GreenchClaw/plugin-sdk/plugin-runtime";
import { createPluginRuntimeStore } from "GreenchClaw/plugin-sdk/runtime-store";

const { setRuntime: setTlonRuntime, getRuntime: getTlonRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "tlon",
    errorMessage: "Tlon runtime not initialized",
  });
export { getTlonRuntime, setTlonRuntime };
