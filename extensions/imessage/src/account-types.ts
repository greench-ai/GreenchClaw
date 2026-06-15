import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";

export type IMessageAccountConfig = Omit<
  NonNullable<NonNullable<GreenchClawConfig["channels"]>["imessage"]>,
  "accounts" | "defaultAccount"
>;
