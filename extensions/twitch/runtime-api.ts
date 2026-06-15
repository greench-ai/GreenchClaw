// Private runtime barrel for the bundled Twitch extension.
// Keep this barrel thin and aligned with the local extension surface.

export type {
  ChannelAccountSnapshot,
  ChannelCapabilities,
  ChannelGatewayContext,
  ChannelLogSink,
  ChannelMessageActionAdapter,
  ChannelMessageActionContext,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelOutboundContext,
  ChannelResolveKind,
  ChannelResolveResult,
  ChannelStatusAdapter,
} from "GreenchClaw/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "GreenchClaw/plugin-sdk/channel-core";
export type { OutboundDeliveryResult } from "GreenchClaw/plugin-sdk/channel-send-result";
export type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
export type { RuntimeEnv } from "GreenchClaw/plugin-sdk/runtime";
export type { WizardPrompter } from "GreenchClaw/plugin-sdk/setup";
