import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import { inspectSlackAccount } from "./src/account-inspect.js";

export function inspectSlackReadOnlyAccount(cfg: GreenchClawConfig, accountId?: string | null) {
  return inspectSlackAccount({ cfg, accountId });
}
