import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import { inspectDiscordAccount } from "./src/account-inspect.js";

export function inspectDiscordReadOnlyAccount(cfg: GreenchClawConfig, accountId?: string | null) {
  return inspectDiscordAccount({ cfg, accountId });
}
