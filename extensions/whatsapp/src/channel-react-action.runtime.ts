import { readStringOrNumberParam, readStringParam } from "GreenchClaw/plugin-sdk/channel-actions";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";

export { resolveReactionMessageId } from "GreenchClaw/plugin-sdk/channel-actions";
export { handleWhatsAppAction } from "./action-runtime.js";
export { isWhatsAppGroupJid, normalizeWhatsAppTarget } from "./normalize.js";
export { readStringOrNumberParam, readStringParam, type GreenchClawConfig };
