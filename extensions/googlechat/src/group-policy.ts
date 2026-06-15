import { resolveChannelGroupRequireMention } from "GreenchClaw/plugin-sdk/channel-policy";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/core";

type GoogleChatGroupContext = {
  cfg: GreenchClawConfig;
  accountId?: string | null;
  groupId?: string | null;
};

export function resolveGoogleChatGroupRequireMention(params: GoogleChatGroupContext): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}
