import { GREENCHCLAW_PROVIDER_INDEX } from "./GreenchClaw-provider-index.js";
import { normalizeGreenchClawProviderIndex } from "./normalize.js";
import type { GreenchClawProviderIndex } from "./types.js";

export function loadGreenchClawProviderIndex(
  source: unknown = GREENCHCLAW_PROVIDER_INDEX,
): GreenchClawProviderIndex {
  return normalizeGreenchClawProviderIndex(source) ?? { version: 1, providers: {} };
}
