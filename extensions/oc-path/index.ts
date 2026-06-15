import { definePluginEntry } from "GreenchClaw/plugin-sdk/plugin-entry";
import { registerOcPathCli } from "./cli-registration.js";

export default definePluginEntry({
  id: "oc-path",
  name: "OC Path",
  description: "Adds the GreenchClaw path CLI for oc:// workspace file addressing.",
  register(api) {
    registerOcPathCli(api);
  },
});
