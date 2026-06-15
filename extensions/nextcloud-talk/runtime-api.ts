// Private runtime barrel for the bundled Nextcloud Talk extension.
// Keep this barrel thin and aligned with the local extension surface.

export type { AllowlistMatch } from "GreenchClaw/plugin-sdk/allow-from";
export type { ChannelGroupContext } from "GreenchClaw/plugin-sdk/channel-contract";
export { logInboundDrop } from "GreenchClaw/plugin-sdk/channel-logging";
export { createChannelPairingController } from "GreenchClaw/plugin-sdk/channel-pairing";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyConfig,
  GreenchClawConfig,
} from "GreenchClaw/plugin-sdk/config-contracts";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "GreenchClaw/plugin-sdk/runtime-group-policy";
export { createChannelMessageReplyPipeline } from "GreenchClaw/plugin-sdk/channel-message";
export type { OutboundReplyPayload } from "GreenchClaw/plugin-sdk/reply-payload";
export { deliverFormattedTextWithAttachments } from "GreenchClaw/plugin-sdk/reply-payload";
export type { PluginRuntime } from "GreenchClaw/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "GreenchClaw/plugin-sdk/runtime";
export type { SecretInput } from "GreenchClaw/plugin-sdk/secret-input";
export { fetchWithSsrFGuard } from "GreenchClaw/plugin-sdk/ssrf-runtime";
export { setNextcloudTalkRuntime } from "./src/runtime.js";
