// Private runtime barrel for the bundled IRC extension.
// Keep this barrel thin and generic-only.

export type { BaseProbeResult } from "GreenchClaw/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "GreenchClaw/plugin-sdk/channel-core";
export type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
export type { PluginRuntime } from "GreenchClaw/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "GreenchClaw/plugin-sdk/runtime";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyBySenderConfig,
  GroupToolPolicyConfig,
  MarkdownConfig,
} from "GreenchClaw/plugin-sdk/config-contracts";
export type { OutboundReplyPayload } from "GreenchClaw/plugin-sdk/reply-payload";
export { DEFAULT_ACCOUNT_ID } from "GreenchClaw/plugin-sdk/account-id";
export { buildChannelConfigSchema } from "GreenchClaw/plugin-sdk/channel-config-primitives";
export {
  PAIRING_APPROVED_MESSAGE,
  buildBaseChannelStatusSummary,
} from "GreenchClaw/plugin-sdk/channel-status";
export { createChannelPairingController } from "GreenchClaw/plugin-sdk/channel-pairing";
export { createAccountStatusSink } from "GreenchClaw/plugin-sdk/channel-lifecycle";
export { resolveControlCommandGate } from "GreenchClaw/plugin-sdk/command-auth-native";
export { createChannelMessageReplyPipeline } from "GreenchClaw/plugin-sdk/channel-message";
export { chunkTextForOutbound } from "GreenchClaw/plugin-sdk/text-chunking";
export {
  deliverFormattedTextWithAttachments,
  formatTextWithAttachmentLinks,
  resolveOutboundMediaUrls,
} from "GreenchClaw/plugin-sdk/reply-payload";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "GreenchClaw/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "GreenchClaw/plugin-sdk/dangerous-name-runtime";
export { logInboundDrop } from "GreenchClaw/plugin-sdk/channel-inbound";
