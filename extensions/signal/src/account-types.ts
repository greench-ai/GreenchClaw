import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";

export type SignalAccountConfig = Omit<
  Exclude<NonNullable<GreenchClawConfig["channels"]>["signal"], undefined>,
  "accounts"
>;
