export { clearAccountEntryFields } from "GreenchClaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID } from "GreenchClaw/plugin-sdk/account-id";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/account-resolution";
import type { ChannelPlugin } from "GreenchClaw/plugin-sdk/core";
import { listLineAccountIds, resolveDefaultLineAccountId, resolveLineAccount } from "./accounts.js";
import { resolveExactLineGroupConfigKey } from "./group-keys.js";
import type { LineConfig, ResolvedLineAccount } from "./types.js";

export {
  DEFAULT_ACCOUNT_ID,
  listLineAccountIds,
  resolveDefaultLineAccountId,
  resolveExactLineGroupConfigKey,
  resolveLineAccount,
};

export type { ChannelPlugin, LineConfig, GreenchClawConfig, ResolvedLineAccount };
