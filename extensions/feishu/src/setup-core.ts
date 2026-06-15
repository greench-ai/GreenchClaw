import {
  DEFAULT_ACCOUNT_ID,
  type ChannelSetupAdapter,
  type GreenchClawConfig,
} from "GreenchClaw/plugin-sdk/setup";
import { resolveDefaultFeishuAccountId } from "./accounts.js";
import type { FeishuConfig } from "./types.js";

export function setFeishuNamedAccountEnabled(
  cfg: GreenchClawConfig,
  accountId: string,
  enabled: boolean,
): GreenchClawConfig {
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...feishuCfg,
        accounts: {
          ...feishuCfg?.accounts,
          [accountId]: {
            ...feishuCfg?.accounts?.[accountId],
            enabled,
          },
        },
      },
    },
  };
}

export const feishuSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ cfg, accountId }) => accountId?.trim() || resolveDefaultFeishuAccountId(cfg),
  applyAccountConfig: ({ cfg, accountId }) => {
    const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;
    if (isDefault) {
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          feishu: {
            ...cfg.channels?.feishu,
            enabled: true,
          },
        },
      };
    }
    return setFeishuNamedAccountEnabled(cfg, accountId, true);
  },
};
