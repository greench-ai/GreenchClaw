import type { ChannelPlugin } from "GreenchClaw/plugin-sdk/core";

export const whatsappCommandPolicy: NonNullable<ChannelPlugin["commands"]> = {
  enforceOwnerForCommands: true,
  preferSenderE164ForCommands: true,
  skipWhenConfigEmpty: true,
};
