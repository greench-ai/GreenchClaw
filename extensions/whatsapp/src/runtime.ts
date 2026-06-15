import type { PluginRuntime } from "GreenchClaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "GreenchClaw/plugin-sdk/runtime-store";

const { setRuntime: setWhatsAppRuntime, getRuntime: getWhatsAppRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "whatsapp",
    errorMessage: "WhatsApp runtime not initialized",
  });
export { getWhatsAppRuntime, setWhatsAppRuntime };
