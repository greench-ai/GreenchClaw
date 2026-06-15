// Private runtime barrel for the bundled Feishu extension.
// Keep this barrel thin and generic-only.

export type {
  AllowlistMatch,
  AnyAgentTool,
  BaseProbeResult,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelPlugin,
  HistoryEntry,
  GreenchClawConfig,
  GreenchClawPluginApi,
  OutboundIdentity,
  PluginRuntime,
  ReplyPayload,
} from "GreenchClaw/plugin-sdk/core";
export type { GreenchClawConfig as ClawdbotConfig } from "GreenchClaw/plugin-sdk/core";
export type { RuntimeEnv } from "GreenchClaw/plugin-sdk/runtime";
export type { GroupToolPolicyConfig } from "GreenchClaw/plugin-sdk/config-contracts";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createActionGate,
  createDedupeCache,
} from "GreenchClaw/plugin-sdk/core";
export {
  PAIRING_APPROVED_MESSAGE,
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "GreenchClaw/plugin-sdk/channel-status";
export { buildAgentMediaPayload } from "GreenchClaw/plugin-sdk/agent-media-payload";
export { createChannelPairingController } from "GreenchClaw/plugin-sdk/channel-pairing";
export { createReplyPrefixContext } from "GreenchClaw/plugin-sdk/channel-message";
export {
  evaluateSupplementalContextVisibility,
  filterSupplementalContextItems,
  resolveChannelContextVisibilityMode,
} from "GreenchClaw/plugin-sdk/context-visibility-runtime";
export {
  loadSessionStore,
  resolveSessionStoreEntry,
} from "GreenchClaw/plugin-sdk/session-store-runtime";
export { readJsonFileWithFallback } from "GreenchClaw/plugin-sdk/json-store";
export { createPersistentDedupe } from "GreenchClaw/plugin-sdk/persistent-dedupe";
export { normalizeAgentId } from "GreenchClaw/plugin-sdk/routing";
export { chunkTextForOutbound } from "GreenchClaw/plugin-sdk/text-chunking";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "GreenchClaw/plugin-sdk/webhook-ingress";
export { setFeishuRuntime } from "./src/runtime.js";
