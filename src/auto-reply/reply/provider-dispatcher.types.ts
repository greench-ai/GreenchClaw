import type { GreenchClawConfig } from "../../config/types.GreenchClaw.js";
import type { GetReplyOptions } from "../get-reply-options.types.js";
import type { FinalizedMsgContext, MsgContext } from "../templating.js";
import type { DispatchFromConfigResult } from "./dispatch-from-config.types.js";
import type { GetReplyFromConfig } from "./get-reply.types.js";
import type {
  ReplyDispatcherOptions,
  ReplyDispatcherWithTypingOptions,
} from "./reply-dispatcher.js";

type DispatchReplyContext = MsgContext | FinalizedMsgContext;
type DispatchReplyOptions = Omit<GetReplyOptions, "onBlockReply">;

export type DispatchReplyWithBufferedBlockDispatcher = (params: {
  ctx: DispatchReplyContext;
  cfg: GreenchClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  replyOptions?: DispatchReplyOptions;
  replyResolver?: GetReplyFromConfig;
}) => Promise<DispatchFromConfigResult>;

export type DispatchReplyWithDispatcher = (params: {
  ctx: DispatchReplyContext;
  cfg: GreenchClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  replyOptions?: DispatchReplyOptions;
  replyResolver?: GetReplyFromConfig;
}) => Promise<DispatchFromConfigResult>;
