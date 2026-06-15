// Private runtime barrel for the bundled Microsoft Teams extension.
// Keep this barrel thin and aligned with the local extension surface.

export { DEFAULT_ACCOUNT_ID } from "GreenchClaw/plugin-sdk/account-id";
export type { AllowlistMatch } from "GreenchClaw/plugin-sdk/allow-from";
export {
  mergeAllowlist,
  resolveAllowlistMatchSimple,
  summarizeMapping,
} from "GreenchClaw/plugin-sdk/allow-from";
export type {
  BaseProbeResult,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelOutboundAdapter,
} from "GreenchClaw/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "GreenchClaw/plugin-sdk/channel-core";
export { logTypingFailure } from "GreenchClaw/plugin-sdk/channel-logging";
export { createChannelPairingController } from "GreenchClaw/plugin-sdk/channel-pairing";
export { resolveToolsBySender } from "GreenchClaw/plugin-sdk/channel-policy";
export { createChannelMessageReplyPipeline } from "GreenchClaw/plugin-sdk/channel-message";
export {
  PAIRING_APPROVED_MESSAGE,
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "GreenchClaw/plugin-sdk/channel-status";
export {
  buildChannelKeyCandidates,
  normalizeChannelSlug,
  resolveChannelEntryMatchWithFallback,
  resolveNestedAllowlistDecision,
} from "GreenchClaw/plugin-sdk/channel-targets";
export type {
  GroupPolicy,
  GroupToolPolicyConfig,
  MSTeamsChannelConfig,
  MSTeamsConfig,
  MSTeamsReplyStyle,
  MSTeamsTeamConfig,
  MarkdownTableMode,
  GreenchClawConfig,
} from "GreenchClaw/plugin-sdk/config-contracts";
export { isDangerousNameMatchingEnabled } from "GreenchClaw/plugin-sdk/dangerous-name-runtime";
export { resolveDefaultGroupPolicy } from "GreenchClaw/plugin-sdk/runtime-group-policy";
export { withFileLock } from "GreenchClaw/plugin-sdk/file-lock";
export { keepHttpServerTaskAlive } from "GreenchClaw/plugin-sdk/channel-lifecycle";
export {
  detectMime,
  extensionForMime,
  extractOriginalFilename,
  getFileExtension,
  resolveChannelMediaMaxBytes,
} from "GreenchClaw/plugin-sdk/media-runtime";
export { dispatchReplyFromConfigWithSettledDispatcher } from "GreenchClaw/plugin-sdk/inbound-reply-dispatch";
export { loadOutboundMediaFromUrl } from "GreenchClaw/plugin-sdk/outbound-media";
export { buildMediaPayload } from "GreenchClaw/plugin-sdk/reply-payload";
export type { ReplyPayload } from "GreenchClaw/plugin-sdk/reply-payload";
export type { PluginRuntime } from "GreenchClaw/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "GreenchClaw/plugin-sdk/runtime";
export type { SsrFPolicy } from "GreenchClaw/plugin-sdk/ssrf-runtime";
export { fetchWithSsrFGuard } from "GreenchClaw/plugin-sdk/ssrf-runtime";
export { normalizeStringEntries } from "GreenchClaw/plugin-sdk/string-normalization-runtime";
export { chunkTextForOutbound } from "GreenchClaw/plugin-sdk/text-chunking";
export { DEFAULT_WEBHOOK_MAX_BODY_BYTES } from "GreenchClaw/plugin-sdk/webhook-ingress";
export { setMSTeamsRuntime } from "./src/runtime.js";
