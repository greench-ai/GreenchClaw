import type { ReplyToMode } from "GreenchClaw/plugin-sdk/config-contracts";
import type { ReplyThreadingPolicy } from "GreenchClaw/plugin-sdk/reply-reference";
import { resolveBatchedReplyThreadingPolicy } from "GreenchClaw/plugin-sdk/reply-reference";

type ReplyThreadingContext = {
  ReplyThreading?: ReplyThreadingPolicy;
};

export function applyImplicitReplyBatchGate(
  ctx: object,
  replyToMode: ReplyToMode,
  isBatched: boolean,
) {
  const replyThreading = resolveBatchedReplyThreadingPolicy(replyToMode, isBatched);
  if (!replyThreading) {
    return;
  }
  (ctx as ReplyThreadingContext).ReplyThreading = replyThreading;
}
