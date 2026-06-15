import { describePluginRegistrationContract } from "GreenchClaw/plugin-sdk/plugin-test-contracts";

describePluginRegistrationContract({
  pluginId: "alibaba",
  videoGenerationProviderIds: ["alibaba"],
  requireGenerateVideo: true,
});
