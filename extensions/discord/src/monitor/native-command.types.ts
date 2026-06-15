import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import type { CommandArgValues } from "GreenchClaw/plugin-sdk/native-command-registry";

export type DiscordConfig = NonNullable<GreenchClawConfig["channels"]>["discord"];

export type DiscordCommandArgs = {
  raw?: string;
  values?: CommandArgValues;
};
