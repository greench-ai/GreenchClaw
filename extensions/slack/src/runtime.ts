import type { PluginRuntime } from "GreenchClaw/plugin-sdk/channel-core";
import { createPluginRuntimeStore } from "GreenchClaw/plugin-sdk/runtime-store";

type SlackChannelRuntime = {
  handleSlackAction?: typeof import("./action-runtime.js").handleSlackAction;
};

type SlackRuntime = PluginRuntime & {
  channel: PluginRuntime["channel"] & {
    slack?: SlackChannelRuntime;
  };
};

const {
  setRuntime: setSlackRuntime,
  clearRuntime: clearSlackRuntime,
  tryGetRuntime: getOptionalSlackRuntime,
} = createPluginRuntimeStore<SlackRuntime>({
  pluginId: "slack",
  errorMessage: "Slack runtime not initialized",
});
export { clearSlackRuntime, getOptionalSlackRuntime, setSlackRuntime };
