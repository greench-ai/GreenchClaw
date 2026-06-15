import type { PluginRuntime } from "GreenchClaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "GreenchClaw/plugin-sdk/runtime-store";

const { setRuntime: setIMessageRuntime } = createPluginRuntimeStore<PluginRuntime>({
  pluginId: "imessage",
  errorMessage: "iMessage runtime not initialized",
});
export { setIMessageRuntime };
