import { formatTrimmedAllowFromEntries } from "GreenchClaw/plugin-sdk/channel-config-helpers";
import { PAIRING_APPROVED_MESSAGE } from "GreenchClaw/plugin-sdk/channel-status";
import {
  DEFAULT_ACCOUNT_ID,
  getChatChannelMeta,
  type ChannelPlugin,
} from "GreenchClaw/plugin-sdk/core";
import { resolveChannelMediaMaxBytes } from "GreenchClaw/plugin-sdk/media-runtime";
import { collectStatusIssuesFromLastError } from "GreenchClaw/plugin-sdk/status-helpers";
import { normalizeIMessageMessagingTarget } from "./normalize.js";
export { chunkTextForOutbound } from "GreenchClaw/plugin-sdk/text-chunking";

export {
  collectStatusIssuesFromLastError,
  DEFAULT_ACCOUNT_ID,
  formatTrimmedAllowFromEntries,
  getChatChannelMeta,
  normalizeIMessageMessagingTarget,
  PAIRING_APPROVED_MESSAGE,
  resolveChannelMediaMaxBytes,
};

export type { ChannelPlugin };
