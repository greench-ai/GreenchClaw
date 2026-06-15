import type { GreenchClawConfig } from "./runtime-api.js";
import { inspectTelegramAccount } from "./src/account-inspect.js";

export function inspectTelegramReadOnlyAccount(cfg: GreenchClawConfig, accountId?: string | null) {
  return inspectTelegramAccount({ cfg, accountId });
}
