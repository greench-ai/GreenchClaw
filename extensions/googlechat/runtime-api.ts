// Private runtime barrel for the bundled Google Chat extension.
// Keep this barrel thin and avoid broad plugin-sdk surfaces during bootstrap.

export { DEFAULT_ACCOUNT_ID } from "GreenchClaw/plugin-sdk/account-id";
export {
  createActionGate,
  jsonResult,
  readNumberParam,
  readReactionParams,
  readStringParam,
} from "GreenchClaw/plugin-sdk/channel-actions";
export { buildChannelConfigSchema } from "GreenchClaw/plugin-sdk/channel-config-primitives";
export type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "GreenchClaw/plugin-sdk/channel-contract";
export { missingTargetError } from "GreenchClaw/plugin-sdk/channel-feedback";
export {
  createAccountStatusSink,
  runPassiveAccountLifecycle,
} from "GreenchClaw/plugin-sdk/channel-lifecycle";
export { createChannelPairingController } from "GreenchClaw/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "GreenchClaw/plugin-sdk/channel-message";
export { PAIRING_APPROVED_MESSAGE } from "GreenchClaw/plugin-sdk/channel-status";
export { chunkTextForOutbound } from "GreenchClaw/plugin-sdk/text-chunking";
export type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
export { GoogleChatConfigSchema } from "GreenchClaw/plugin-sdk/bundled-channel-config-schema";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "GreenchClaw/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "GreenchClaw/plugin-sdk/dangerous-name-runtime";
export {
  fetchRemoteMedia,
  resolveChannelMediaMaxBytes,
} from "GreenchClaw/plugin-sdk/media-runtime";
export { loadOutboundMediaFromUrl } from "GreenchClaw/plugin-sdk/outbound-media";
export type { PluginRuntime } from "GreenchClaw/plugin-sdk/runtime-store";
export { fetchWithSsrFGuard } from "GreenchClaw/plugin-sdk/ssrf-runtime";
export type {
  GoogleChatAccountConfig,
  GoogleChatConfig,
} from "GreenchClaw/plugin-sdk/config-contracts";
export { extractToolSend } from "GreenchClaw/plugin-sdk/tool-send";
export { resolveInboundMentionDecision } from "GreenchClaw/plugin-sdk/channel-inbound";
export { resolveInboundRouteEnvelopeBuilderWithRuntime } from "GreenchClaw/plugin-sdk/inbound-envelope";
export { resolveWebhookPath } from "GreenchClaw/plugin-sdk/webhook-ingress";
export {
  registerWebhookTargetWithPluginRoute,
  resolveWebhookTargetWithAuthOrReject,
  withResolvedWebhookRequestPipeline,
} from "GreenchClaw/plugin-sdk/webhook-targets";
export {
  createWebhookInFlightLimiter,
  readJsonWebhookBodyOrReject,
  type WebhookInFlightLimiter,
} from "GreenchClaw/plugin-sdk/webhook-request-guards";
export { setGoogleChatRuntime } from "./src/runtime.js";
