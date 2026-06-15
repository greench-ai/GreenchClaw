// Private runtime barrel for the bundled Mattermost extension.
// Keep this barrel thin and generic-only.

export type {
  BaseProbeResult,
  ChannelAccountSnapshot,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelPlugin,
  ChatType,
  HistoryEntry,
  GreenchClawConfig,
  GreenchClawPluginApi,
  PluginRuntime,
} from "GreenchClaw/plugin-sdk/core";
export type { RuntimeEnv } from "GreenchClaw/plugin-sdk/runtime";
export type { ReplyPayload } from "GreenchClaw/plugin-sdk/reply-runtime";
export type { ModelsProviderData } from "GreenchClaw/plugin-sdk/models-provider-runtime";
export type {
  BlockStreamingCoalesceConfig,
  DmPolicy,
  GroupPolicy,
} from "GreenchClaw/plugin-sdk/config-contracts";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createDedupeCache,
  parseStrictPositiveInteger,
  resolveClientIp,
  isTrustedProxyAddress,
} from "GreenchClaw/plugin-sdk/core";
export { buildComputedAccountStatusSnapshot } from "GreenchClaw/plugin-sdk/channel-status";
export { createAccountStatusSink } from "GreenchClaw/plugin-sdk/channel-lifecycle";
export { buildAgentMediaPayload } from "GreenchClaw/plugin-sdk/agent-media-payload";
export {
  listSkillCommandsForAgents,
  resolveControlCommandGate,
  resolveStoredModelOverride,
} from "GreenchClaw/plugin-sdk/command-auth-native";
export { buildModelsProviderData } from "GreenchClaw/plugin-sdk/models-provider-runtime";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "GreenchClaw/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "GreenchClaw/plugin-sdk/dangerous-name-runtime";
export { loadSessionStore, resolveStorePath } from "GreenchClaw/plugin-sdk/session-store-runtime";
export { formatInboundFromLabel } from "GreenchClaw/plugin-sdk/channel-inbound";
export { logInboundDrop } from "GreenchClaw/plugin-sdk/channel-inbound";
export { createChannelPairingController } from "GreenchClaw/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "GreenchClaw/plugin-sdk/channel-message";
export { logTypingFailure } from "GreenchClaw/plugin-sdk/channel-feedback";
export { loadOutboundMediaFromUrl } from "GreenchClaw/plugin-sdk/outbound-media";
export { rawDataToString } from "GreenchClaw/plugin-sdk/webhook-ingress";
export { chunkTextForOutbound } from "GreenchClaw/plugin-sdk/text-chunking";
export {
  DEFAULT_GROUP_HISTORY_LIMIT,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
} from "GreenchClaw/plugin-sdk/reply-history";
export { normalizeAccountId, resolveThreadSessionKeys } from "GreenchClaw/plugin-sdk/routing";
export { resolveAllowlistMatchSimple } from "GreenchClaw/plugin-sdk/allow-from";
export { registerPluginHttpRoute } from "GreenchClaw/plugin-sdk/webhook-targets";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
} from "GreenchClaw/plugin-sdk/webhook-ingress";
export {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  migrateBaseNameToDefaultAccount,
} from "GreenchClaw/plugin-sdk/setup";
export {
  getAgentScopedMediaLocalRoots,
  resolveChannelMediaMaxBytes,
} from "GreenchClaw/plugin-sdk/media-runtime";
export { normalizeProviderId } from "GreenchClaw/plugin-sdk/provider-model-shared";
export { setMattermostRuntime } from "./src/runtime.js";
