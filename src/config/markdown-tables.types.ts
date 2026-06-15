import type { MarkdownTableMode } from "./types.base.js";
import type { GreenchClawConfig } from "./types.GreenchClaw.js";

export type ResolveMarkdownTableModeParams = {
  cfg?: Partial<GreenchClawConfig>;
  channel?: string | null;
  accountId?: string | null;
};

export type ResolveMarkdownTableMode = (
  params: ResolveMarkdownTableModeParams,
) => MarkdownTableMode;
