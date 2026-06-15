import type { DiscordAccountConfig } from "GreenchClaw/plugin-sdk/config-contracts";

export function resolveDiscordVoiceEnabled(voice: DiscordAccountConfig["voice"]): boolean {
  if (voice?.enabled !== undefined) {
    return voice.enabled;
  }
  return voice !== undefined;
}
