import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";

export type WhatsAppAccountConfig = NonNullable<
  NonNullable<NonNullable<GreenchClawConfig["channels"]>["whatsapp"]>["accounts"]
>[string];
